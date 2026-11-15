package com.agritainmen.org.web;

import com.agritainmen.common.core.ApiResponse;
import com.agritainmen.common.core.BusinessException;
import com.agritainmen.common.core.ErrorCode;
import com.agritainmen.common.core.Ids;
import com.agritainmen.org.service.OrgProfiles;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Set;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;

@RestController
@RequestMapping("/api/v1/org")
public class OrgWriteController {
    private final JdbcTemplate jdbc;
    private final OrgProfiles profiles;
    public OrgWriteController(JdbcTemplate jdbc, OrgProfiles profiles) { this.jdbc = jdbc; this.profiles = profiles; }

    public record SupplierRequest(@NotBlank String name, String region, String contactPhone, String category, Map<String, Object> profile) {}
    public record FarmRequest(@NotBlank String name, String region, String contact, String contactPhone, String status, Map<String, Object> profile) {}
    public record FarmAccountRequest(@NotBlank String farmId, @NotBlank String account, @NotBlank String displayName, String role, String priceLevel) {}
    public record FarmAccountPatch(Boolean enabled, String displayName, String priceLevel) {}
    public record PromoterRequest(@NotBlank String name, String level, String region) {}
    public record LeaderStatusRequest(@NotBlank String status) {}
    public record DriverRequest(@NotBlank String supplierId, @NotBlank String name, String phone) {}
    public record DriverPatch(String name, String phone, String status, String password) {}

    @PostMapping("/suppliers")
    @Transactional
    public ApiResponse<Map<String, Object>> createSupplier(@Valid @RequestBody SupplierRequest request) {
        requirePhone(request.contactPhone());
        requireUniqueSupplierPhone(request.contactPhone(), null);
        requireSupplierProfile(request.profile());
        String id = Ids.uuid("SUP");
        jdbc.update("insert into org_supplier(id,tenant_id,name,contact_phone,region,category,status,profile_json,created_at,updated_at,version,deleted) values (?, 'PLATFORM', ?, ?, ?, ?, 'pending', ?, current_timestamp, current_timestamp, 0, false)",
                id, request.name().trim(), request.contactPhone().trim(), request.region(), request.category(), profiles.encode(request.profile()));
        return ApiResponse.ok(supplier(id));
    }

    @PutMapping("/suppliers/{id}")
    @Transactional
    public ApiResponse<Map<String, Object>> updateSupplier(@PathVariable String id, @Valid @RequestBody SupplierRequest request) {
        Map<String, Object> current = supplier(id);
        String phone = request.contactPhone() == null ? (String) current.get("contactPhone") : request.contactPhone();
        requirePhone(phone);
        requireUniqueSupplierPhone(phone, id);
        Map<String, Object> profile = new LinkedHashMap<>();
        if (request.profile() != null) profile.putAll(request.profile());
        else ((Map<?, ?>) current.get("profile")).forEach((key, value) -> {
            if (key instanceof String name) profile.put(name, value);
        });
        profile.remove("warehouse");
        Object warehouse = ((Map<?, ?>) current.get("profile")).get("warehouse");
        if (warehouse != null) profile.put("warehouse", warehouse);
        requireSupplierProfile(profile);
        int updated = jdbc.update("update org_supplier set name=?, contact_phone=?, region=?, category=?, profile_json=?, updated_at=current_timestamp, version=version+1 where id=? and tenant_id='PLATFORM' and version=? and deleted=false",
                request.name().trim(), phone.trim(),
                request.region() == null ? current.get("region") : request.region(),
                request.category() == null ? current.get("category") : request.category(),
                profiles.encode(profile), id, current.get("version"));
        if (updated != 1) throw new BusinessException(ErrorCode.CONFLICT, "供应商资料已更新，请刷新后重试");
        return ApiResponse.ok(supplier(id));
    }

    public record SupplierAuditRequest(boolean approved) {}
    public record SupplierPauseRequest(@NotBlank @Size(max = 500) String reason) {}
    @PostMapping("/suppliers/{id}/audit")
    public ApiResponse<Map<String, Object>> auditSupplier(@PathVariable String id, @RequestBody(required = false) SupplierAuditRequest request) {
        supplier(id);
        boolean approved = request == null || request.approved();
        int updated = jdbc.update("update org_supplier set status=?, certified=?, pause_reason=null, updated_at=current_timestamp, version=version+1 where id=? and tenant_id='PLATFORM' and status='pending' and certified=false and deleted=false", approved ? "cooperating" : "paused", approved, id);
        if (updated != 1) throw new BusinessException(ErrorCode.CONFLICT, "供应商当前不可审核");
        return ApiResponse.ok(supplier(id));
    }

    @PostMapping("/suppliers/{id}/restore")
    public ApiResponse<Map<String, Object>> restoreSupplier(@PathVariable String id) {
        supplier(id);
        int updated = jdbc.update("update org_supplier set status='pending', pause_reason=null, updated_at=current_timestamp, version=version+1 where id=? and tenant_id='PLATFORM' and status='paused' and certified=false and deleted=false", id);
        if (updated != 1) throw new BusinessException(ErrorCode.CONFLICT, "供应商当前不可恢复待审核");
        return ApiResponse.ok(supplier(id));
    }

    @PostMapping("/suppliers/{id}/pause")
    public ApiResponse<Map<String, Object>> pauseSupplier(@PathVariable String id, @Valid @RequestBody SupplierPauseRequest request) {
        supplier(id);
        int updated = jdbc.update("update org_supplier set status='paused', pause_reason=?, updated_at=current_timestamp, version=version+1 where id=? and tenant_id='PLATFORM' and status='cooperating' and certified=true and deleted=false", request.reason().trim(), id);
        if (updated != 1) throw new BusinessException(ErrorCode.CONFLICT, "供应商当前不可暂停合作");
        return ApiResponse.ok(supplier(id));
    }

    @PostMapping("/suppliers/{id}/resume")
    public ApiResponse<Map<String, Object>> resumeSupplier(@PathVariable String id) {
        supplier(id);
        int updated = jdbc.update("update org_supplier set status='cooperating', pause_reason=null, updated_at=current_timestamp, version=version+1 where id=? and tenant_id='PLATFORM' and status='paused' and certified=true and deleted=false", id);
        if (updated != 1) throw new BusinessException(ErrorCode.CONFLICT, "供应商当前不可恢复合作");
        return ApiResponse.ok(supplier(id));
    }

    @PostMapping("/farms")
    @Transactional
    public ApiResponse<Map<String, Object>> createFarm(@Valid @RequestBody FarmRequest request) {
        requireOptionalPhone(request.contactPhone());
        requireFarmStatus(request.status());
        requireFarmAddress(request.profile());
        requireFarmProfile(request.profile());
        String id = Ids.uuid("FARM");
        jdbc.update("insert into org_farm(id,tenant_id,name,region,status,contact,contact_phone,profile_json,created_at,updated_at,version,deleted) values (?, 'PLATFORM', ?, ?, ?, ?, ?, ?, current_timestamp, current_timestamp, 0, false)",
                id, request.name().trim(), request.region(), request.status() == null ? "pending" : request.status(), request.contact(), request.contactPhone(), profiles.encode(request.profile()));
        return ApiResponse.ok(farm(id));
    }

    @PutMapping("/farms/{id}")
    @Transactional
    public ApiResponse<Map<String, Object>> updateFarm(@PathVariable String id, @Valid @RequestBody FarmRequest request) {
        Map<String, Object> current = farm(id);
        requireOptionalPhone(request.contactPhone());
        requireFarmStatus(request.status());
        requireFarmAddress(request.profile() == null ? (Map<String, Object>) current.get("profile") : request.profile());
        requireFarmProfile(request.profile());
        jdbc.update("update org_farm set name=?, region=?, status=?, contact=?, contact_phone=?, profile_json=?, updated_at=current_timestamp, version=version+1 where id=? and deleted=false",
                request.name().trim(), request.region() == null ? current.get("region") : request.region(),
                request.status() == null ? current.get("status") : request.status(),
                request.contact() == null ? current.get("contact") : request.contact(),
                request.contactPhone() == null ? current.get("contactPhone") : request.contactPhone(),
                profiles.encode(request.profile() == null ? (Map<String, Object>) current.get("profile") : request.profile()), id);
        return ApiResponse.ok(farm(id));
    }

    @PostMapping("/farm-accounts")
    public ApiResponse<Map<String, Object>> createFarmAccount(@Valid @RequestBody FarmAccountRequest request) {
        String id = Ids.uuid("FACC");
        jdbc.update("insert into org_farm_account(id,tenant_id,farm_id,account,display_name,role,price_level,enabled,created_at,updated_at,version,deleted) values (?, 'PLATFORM', ?, ?, ?, ?, ?, true, current_timestamp, current_timestamp, 0, false)",
                id, request.farmId(), request.account(), request.displayName(), request.role() == null ? "owner" : request.role(), request.priceLevel());
        return ApiResponse.ok(jdbc.queryForMap("select id, farm_id, account, display_name, role, price_level, enabled from org_farm_account where id=?", id));
    }

    @GetMapping("/farm-accounts/{id}")
    public ApiResponse<Map<String, Object>> farmAccount(@PathVariable String id) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                select id, farm_id, account, display_name, role, price_level, enabled
                from org_farm_account where id=? and tenant_id='PLATFORM' and deleted=false
                """, id);
        if (rows.isEmpty()) throw new BusinessException(ErrorCode.NOT_FOUND, "门店账号不存在");
        return ApiResponse.ok(rows.getFirst());
    }

    @PutMapping("/farm-accounts/{id}")
    public ApiResponse<Map<String, Object>> updateFarmAccount(@PathVariable String id, @RequestBody FarmAccountPatch request) {
        Map<String, Object> current = jdbc.queryForMap("select id, farm_id, account, display_name, role, price_level, enabled from org_farm_account where id=? and deleted=false", id);
        jdbc.update("update org_farm_account set display_name=?, price_level=?, enabled=?, updated_at=current_timestamp, version=version+1 where id=?",
                request.displayName() == null ? current.get("display_name") : request.displayName(),
                request.priceLevel() == null ? current.get("price_level") : request.priceLevel(),
                request.enabled() == null ? current.get("enabled") : request.enabled(), id);
        return ApiResponse.ok(jdbc.queryForMap("select id, farm_id, account, display_name, role, price_level, enabled from org_farm_account where id=?", id));
    }

    @PatchMapping("/farm-accounts/{id}")
    public ApiResponse<Map<String, Object>> toggleFarmAccount(@PathVariable String id) {
        jdbc.update("update org_farm_account set enabled = not enabled, updated_at=current_timestamp, version=version+1 where id=?", id);
        return ApiResponse.ok(jdbc.queryForMap("select id, farm_id, account, display_name, role, price_level, enabled from org_farm_account where id=?", id));
    }

    @PostMapping("/promoters")
    public ApiResponse<Map<String, Object>> createPromoter(@Valid @RequestBody PromoterRequest request) {
        String id = Ids.uuid("PROM");
        jdbc.update("insert into org_promoter(id,tenant_id,name,level,region,status,created_at,updated_at,version,deleted) values (?, 'PLATFORM', ?, ?, ?, 'active', current_timestamp, current_timestamp, 0, false)",
                id, request.name(), request.level() == null ? "level1" : request.level(), request.region());
        return ApiResponse.ok(promoter(id));
    }

    @PutMapping("/promoters/{id}")
    public ApiResponse<Map<String, Object>> updatePromoter(@PathVariable String id, @RequestBody PromoterRequest request) {
        Map<String, Object> current = promoter(id);
        jdbc.update("update org_promoter set name=?, level=?, region=?, updated_at=current_timestamp, version=version+1 where id=?",
                request.name() == null ? current.get("name") : request.name(),
                request.level() == null ? current.get("level") : request.level(),
                request.region() == null ? current.get("region") : request.region(), id);
        return ApiResponse.ok(promoter(id));
    }

    @PatchMapping("/leaders/{id}")
    public ApiResponse<Map<String, Object>> setLeaderStatus(@PathVariable String id, @Valid @RequestBody LeaderStatusRequest request) {
        int updated = jdbc.update("update org_leader set status=?, updated_at=current_timestamp, version=version+1 where id=?", request.status(), id);
        if (updated != 1) throw new BusinessException(ErrorCode.NOT_FOUND, "团长不存在");
        return ApiResponse.ok(jdbc.queryForMap("select id, name, level, leader_id, status from org_leader where id=?", id));
    }

    @PostMapping("/drivers")
    public ApiResponse<Map<String, Object>> createDriver(@Valid @RequestBody DriverRequest request) {
        String id = Ids.uuid("DRIVER");
        jdbc.update("insert into org_driver(id,tenant_id,supplier_id,name,phone,status,created_at,updated_at,version,deleted) values (?, 'PLATFORM', ?, ?, ?, 'active', current_timestamp, current_timestamp, 0, false)",
                id, request.supplierId(), request.name(), request.phone());
        return ApiResponse.ok(driver(id));
    }

    @PutMapping("/drivers/{id}")
    public ApiResponse<Map<String, Object>> updateDriver(@PathVariable String id, @RequestBody DriverPatch request) {
        Map<String, Object> current = driver(id);
        jdbc.update("update org_driver set name=?, phone=?, status=?, updated_at=current_timestamp, version=version+1 where id=?",
                request.name() == null ? current.get("name") : request.name(),
                request.phone() == null ? current.get("phone") : request.phone(),
                request.status() == null ? current.get("status") : request.status(), id);
        return ApiResponse.ok(driver(id));
    }

    @PatchMapping("/drivers/{id}")
    public ApiResponse<Map<String, Object>> patchDriver(@PathVariable String id, @RequestBody DriverPatch request) {
        return updateDriver(id, request);
    }

    private Map<String, Object> supplier(String id) { return profiles.supplier(id); }
    private Map<String, Object> farm(String id) { return profiles.farm(id); }
    private void requirePhone(String phone) {
        if (phone == null || !phone.matches("1[3-9]\\d{9}")) throw new BusinessException(ErrorCode.BAD_REQUEST, "请输入正确的11位手机号");
    }
    private void requireOptionalPhone(String phone) {
        if (phone != null && !phone.isBlank()) requirePhone(phone);
    }
    private void requireFarmStatus(String status) {
        if (status != null && !java.util.Set.of("pending", "active", "paused").contains(status)) throw new BusinessException(ErrorCode.BAD_REQUEST, "门店状态无效");
    }
    private void requireFarmAddress(Map<String, Object> profile) {
        if (profile == null || !(profile.get("address") instanceof String address) || address.isBlank() || address.length() > 500) throw new BusinessException(ErrorCode.BAD_REQUEST, "请填写500字以内的门店地址");
    }
    private void requireUniqueSupplierPhone(String phone, String exceptId) {
        Integer count = jdbc.queryForObject("select count(*) from org_supplier where tenant_id='PLATFORM' and contact_phone=? and id<>?", Integer.class, phone, exceptId == null ? "" : exceptId);
        if (count != null && count > 0) throw new BusinessException(ErrorCode.CONFLICT, "该手机号已绑定其他供应商");
    }
    private void requireSupplierProfile(Map<String, Object> profile) {
        if (profile == null) return;
        requireProfileSize(profile);
        requireStringList(profile.get("brands"), "品牌");
        requireStringList(profile.get("serviceRegions"), "服务区域");
        requireMedia(profile.get("businessLicense"), "supplier-business-license");
        requireMedia(profile.get("permit"), "supplier-permit");
        Object validUntil = profile.get("validUntil");
        if (validUntil != null && !(validUntil instanceof String)) throw new BusinessException(ErrorCode.BAD_REQUEST, "资质有效期格式无效");
        if (validUntil instanceof String date && !date.isBlank()) {
            try { LocalDate.parse(date); }
            catch (DateTimeParseException error) { throw new BusinessException(ErrorCode.BAD_REQUEST, "资质有效期格式无效"); }
        }
    }
    private void requireFarmProfile(Map<String, Object> profile) {
        if (profile == null) return;
        requireProfileSize(profile);
        requireStringList(profile.get("tags"), "门店标签");
        requireMedia(profile.get("image"), "farm-cover");
        Object rating = profile.get("rating");
        if (rating != null && (!(rating instanceof Number number) || number.doubleValue() < 0 || number.doubleValue() > 5))
            throw new BusinessException(ErrorCode.BAD_REQUEST, "门店评分需在0到5之间");
        Object averageSpend = profile.get("averageSpend");
        if (averageSpend != null && (!(averageSpend instanceof Number number) || number.doubleValue() < 0 || number.doubleValue() > 1000000))
            throw new BusinessException(ErrorCode.BAD_REQUEST, "门店客单价无效");
        Object locationStatus = profile.get("locationStatus");
        if (locationStatus != null && !Set.of("pending", "resolved", "failed").contains(locationStatus))
            throw new BusinessException(ErrorCode.BAD_REQUEST, "门店定位状态无效");
        Object location = profile.get("location");
        if (location != null) {
            if (!(location instanceof Map<?, ?> coordinates)
                    || !validCoordinate(coordinates.get("longitude"), -180, 180)
                    || !validCoordinate(coordinates.get("latitude"), -90, 90))
                throw new BusinessException(ErrorCode.BAD_REQUEST, "门店坐标无效");
        }
    }
    private boolean validCoordinate(Object value, double min, double max) {
        return value instanceof Number number && Double.isFinite(number.doubleValue()) && number.doubleValue() >= min && number.doubleValue() <= max;
    }
    private void requireStringList(Object value, String label) {
        if (value == null) return;
        if (!(value instanceof List<?> values) || values.size() > 30 || values.stream().anyMatch(item -> !(item instanceof String text) || text.isBlank() || text.length() > 128))
            throw new BusinessException(ErrorCode.BAD_REQUEST, label + "格式无效");
    }
    private void requireProfileSize(Map<String, Object> profile) {
        if (profiles.encode(profile).length() > 3 * 1024 * 1024)
            throw new BusinessException(ErrorCode.BAD_REQUEST, "资料内容过大");
    }
    private void requireMedia(Object value, String purpose) {
        if (value == null) return;
        if (value instanceof String url) { requireLegacyMediaUrl(url); return; }
        if (!(value instanceof Map<?, ?> reference)) throw new BusinessException(ErrorCode.BAD_REQUEST, "图片引用无效");
        Object source = reference.get("source");
        if ("asset".equals(source) && reference.get("assetId") instanceof String id) {
            Integer count = jdbc.queryForObject("select count(*) from org_media where id=? and tenant_id='PLATFORM' and purpose=?", Integer.class, id, purpose);
            if (count != null && count == 1) return;
        }
        if ("builtin".equals(source) && reference.get("path") instanceof String path && path.startsWith("/static/") && path.length() <= 255) return;
        if ("legacy".equals(source) && reference.get("url") instanceof String url) { requireLegacyMediaUrl(url); return; }
        throw new BusinessException(ErrorCode.BAD_REQUEST, "图片引用无效");
    }
    private void requireLegacyMediaUrl(String url) {
        if (url.length() <= 2048 && url.startsWith("https://")) return;
        if (url.length() <= 2_800_000 && url.matches("^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$")) return;
        throw new BusinessException(ErrorCode.BAD_REQUEST, "图片地址无效");
    }
    private Map<String, Object> promoter(String id) { return jdbc.queryForMap("select id, name, level, region, status from org_promoter where id=?", id); }
    private Map<String, Object> driver(String id) { return jdbc.queryForMap("select id, supplier_id, name, phone, status from org_driver where id=?", id); }
}

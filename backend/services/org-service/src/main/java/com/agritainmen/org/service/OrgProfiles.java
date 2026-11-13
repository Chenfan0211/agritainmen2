package com.agritainmen.org.service;

import com.agritainmen.common.core.BusinessException;
import com.agritainmen.common.core.ErrorCode;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class OrgProfiles {
    private final JdbcTemplate jdbc;
    private final JsonMapper json;

    public OrgProfiles(JdbcTemplate jdbc, JsonMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    public String encode(Map<String, Object> profile) {
        return json.writeValueAsString(profile == null ? Map.of() : profile);
    }

    private Map<String, Object> decode(Object value) {
        if (value == null || value.toString().isBlank()) return Map.of();
        return json.readValue(value.toString(), new TypeReference<Map<String, Object>>() {});
    }

    public Map<String, Object> supplier(String id) {
        List<Map<String, Object>> rows = jdbc.queryForList("select id, name, contact_phone, region, category, status, certified, pause_reason, profile_json, version from org_supplier where id=? and tenant_id='PLATFORM' and deleted=false", id);
        if (rows.isEmpty()) throw new BusinessException(ErrorCode.NOT_FOUND, "供应商不存在");
        return supplierRow(rows.getFirst());
    }

    public List<Map<String, Object>> suppliers() {
        return jdbc.queryForList("select id, name, contact_phone, region, category, status, certified, pause_reason, profile_json, version from org_supplier where tenant_id='PLATFORM' and deleted=false order by name").stream().map(this::supplierRow).toList();
    }

    private Map<String, Object> supplierRow(Map<String, Object> row) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", row.get("id"));
        result.put("name", row.get("name"));
        result.put("contactPhone", row.get("contact_phone"));
        result.put("contact_phone", row.get("contact_phone"));
        result.put("region", row.get("region"));
        result.put("category", row.get("category"));
        result.put("status", row.get("status"));
        result.put("certified", Boolean.TRUE.equals(row.get("certified")));
        result.put("cooperationPauseReason", row.get("pause_reason"));
        result.put("profile", decode(row.get("profile_json")));
        result.put("version", row.get("version"));
        return result;
    }

    public Map<String, Object> updateSupplierWarehouse(String supplierId, long expectedVersion, Map<String, Object> warehouse) {
        Map<String, Object> current = supplier(supplierId);
        Map<String, Object> profile = new LinkedHashMap<>();
        ((Map<?, ?>) current.get("profile")).forEach((key, value) -> {
            if (key instanceof String name) profile.put(name, value);
        });
        profile.put("warehouse", warehouse);
        String encoded = encode(profile);
        if (encoded.length() > 3 * 1024 * 1024) throw new BusinessException(ErrorCode.BAD_REQUEST, "资料内容过大");
        int updated = jdbc.update("update org_supplier set profile_json=?, updated_at=current_timestamp, version=version+1 where id=? and tenant_id='PLATFORM' and version=? and deleted=false",
                encoded, supplierId, expectedVersion);
        if (updated != 1) throw new BusinessException(ErrorCode.CONFLICT, "供应商资料已更新，请刷新后重试");
        return supplier(supplierId);
    }

    public Map<String, Object> farm(String id) {
        List<Map<String, Object>> rows = jdbc.queryForList("select id, name, region, status, contact, contact_phone, profile_json from org_farm where id=? and tenant_id='PLATFORM' and deleted=false", id);
        if (rows.isEmpty()) throw new BusinessException(ErrorCode.NOT_FOUND, "门店不存在");
        return farmRow(rows.getFirst());
    }

    public List<Map<String, Object>> farms() {
        return jdbc.queryForList("select id, name, region, status, contact, contact_phone, profile_json from org_farm where tenant_id='PLATFORM' and deleted=false order by name").stream().map(this::farmRow).toList();
    }

    private Map<String, Object> farmRow(Map<String, Object> row) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", row.get("id"));
        result.put("name", row.get("name"));
        result.put("region", row.get("region"));
        result.put("status", row.get("status"));
        result.put("contact", row.get("contact"));
        result.put("contactPhone", row.get("contact_phone"));
        result.put("profile", decode(row.get("profile_json")));
        return result;
    }
}

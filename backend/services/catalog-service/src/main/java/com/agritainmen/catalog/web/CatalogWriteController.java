package com.agritainmen.catalog.web;

import com.agritainmen.common.core.ApiResponse;
import com.agritainmen.common.core.BusinessException;
import com.agritainmen.common.core.ErrorCode;
import com.agritainmen.common.core.Ids;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/catalog")
public class CatalogWriteController {
    private final JdbcTemplate jdbc;
    public CatalogWriteController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public record CategoryRequest(@NotBlank String code, @NotBlank String name, String icon, Integer sortOrder, Boolean enabled) {}
    public record PriceRequest(@NotBlank String name, @NotBlank String scope, String targetId, Double discountRate, Boolean enabled) {}
    public record SkuRequest(@NotBlank String id, @NotBlank String name, @Min(0) long priceCents) {}
    public record ProductRequest(@NotBlank String supplierId, @NotBlank String name, @NotBlank String category,
                                 @NotBlank String channel, List<SkuRequest> skus, Boolean enabled) {}
    public record ToggleRequest(Boolean enabled) {}
    public record ReviewRequest(boolean approved, String note) {}

    @PostMapping("/categories")
    @Transactional
    public ApiResponse<Map<String, Object>> createCategory(@Valid @RequestBody CategoryRequest request) {
        String id = Ids.uuid("CAT");
        jdbc.update("insert into catalog_category(id,tenant_id,code,name,icon,sort_order,enabled,created_at,updated_at,version,deleted) values (?, 'PLATFORM', ?, ?, ?, ?, ?, current_timestamp, current_timestamp, 0, false)",
                id, request.code(), request.name(), request.icon(), request.sortOrder() == null ? 0 : request.sortOrder(), request.enabled() == null || request.enabled());
        return ApiResponse.ok(findCategory(id));
    }

    public record CategoryPatch(String code, String name, String icon, Integer sortOrder, Boolean enabled) {}

    @PutMapping("/categories/{id}")
    public ApiResponse<Map<String, Object>> updateCategory(@PathVariable String id, @RequestBody CategoryPatch request) {
        Map<String, Object> current = jdbc.queryForMap("select code, name, icon, sort_order, enabled from catalog_category where id=? and deleted=false", id);
        int updated = jdbc.update("update catalog_category set code=?, name=?, icon=?, sort_order=?, enabled=?, updated_at=current_timestamp, version=version+1 where id=? and deleted=false",
                request.code() == null ? current.get("code") : request.code(),
                request.name() == null ? current.get("name") : request.name(),
                request.icon() == null ? current.get("icon") : request.icon(),
                request.sortOrder() == null ? current.get("sort_order") : request.sortOrder(),
                request.enabled() == null ? current.get("enabled") : request.enabled(), id);
        if (updated != 1) throw new BusinessException(ErrorCode.NOT_FOUND, "品类不存在");
        return ApiResponse.ok(findCategory(id));
    }

    @DeleteMapping("/categories/{id}")
    public ApiResponse<Boolean> deleteCategory(@PathVariable String id) {
        String code = jdbc.query("select code from catalog_category where id=? and deleted=false", (rs, i) -> rs.getString(1), id).stream().findFirst().orElse(null);
        if (code == null) throw new BusinessException(ErrorCode.NOT_FOUND, "品类不存在");
        Long used = jdbc.queryForObject("select count(*) from catalog_product where category=? and deleted=false", Long.class, code);
        if (used != null && used > 0) throw new BusinessException(ErrorCode.CONFLICT, "品类已被商品引用，不能删除");
        jdbc.update("update catalog_category set deleted=true, updated_at=current_timestamp, version=version+1 where id=?", id);
        return ApiResponse.ok(true);
    }

    @PostMapping("/prices")
    public ApiResponse<Map<String, Object>> createPrice(@Valid @RequestBody PriceRequest request) { return ApiResponse.ok(upsertPrice(null, request)); }

    @PutMapping("/prices/{id}")
    public ApiResponse<Map<String, Object>> updatePrice(@PathVariable String id, @Valid @RequestBody PriceRequest request) { return ApiResponse.ok(upsertPrice(id, request)); }

    @PatchMapping("/prices/{id}")
    public ApiResponse<Map<String, Object>> togglePrice(@PathVariable String id, @RequestBody ToggleRequest request) {
        int updated = jdbc.update("update catalog_price_policy set enabled=?, updated_at=current_timestamp, version=version+1 where id=? and deleted=false", request.enabled() == null || request.enabled(), id);
        if (updated != 1) throw new BusinessException(ErrorCode.NOT_FOUND, "价格策略不存在");
        return ApiResponse.ok(jdbc.queryForMap("select id, name, scope, target_id, discount_rate, enabled from catalog_price_policy where id=?", id));
    }

    @PostMapping("/products")
    @Transactional
    public ApiResponse<Map<String, Object>> saveProduct(@Valid @RequestBody ProductRequest request) {
        String id = Ids.uuid("PROD");
        jdbc.update("insert into catalog_product(id,tenant_id,supplier_id,name,category,channel,enabled,created_at,updated_at,version,deleted) values (?, 'PLATFORM', ?, ?, ?, ?, ?, current_timestamp, current_timestamp, 0, false)",
                id, request.supplierId(), request.name(), request.category(), request.channel(), request.enabled() == null || request.enabled());
        if (request.skus() != null) {
            for (SkuRequest sku : request.skus()) {
                jdbc.update("insert into catalog_sku(id,tenant_id,product_id,name,price_cents,enabled,created_at,updated_at,version,deleted) values (?, 'PLATFORM', ?, ?, ?, true, current_timestamp, current_timestamp, 0, false)",
                        sku.id(), id, sku.name(), sku.priceCents());
            }
        }
        return ApiResponse.ok(findProduct(id));
    }

    @PatchMapping("/products/{id}")
    public ApiResponse<Map<String, Object>> toggleProduct(@PathVariable String id, @RequestBody ToggleRequest request) {
        int updated = jdbc.update("update catalog_product set enabled=?, updated_at=current_timestamp, version=version+1 where id=? and deleted=false", request.enabled() == null || request.enabled(), id);
        if (updated != 1) throw new BusinessException(ErrorCode.NOT_FOUND, "商品不存在");
        return ApiResponse.ok(findProduct(id));
    }

    @PostMapping("/products/{id}/review")
    public ApiResponse<Boolean> reviewProduct(@PathVariable String id, @Valid @RequestBody ReviewRequest request) {
        Long exists = jdbc.queryForObject("select count(*) from catalog_product where id=? and deleted=false", Long.class, id);
        if (exists == null || exists == 0) throw new BusinessException(ErrorCode.NOT_FOUND, "商品不存在");
        jdbc.update("insert into catalog_product_submission(id,tenant_id,product_id,supplier_id,payload,status,review_note,reviewed_by,reviewed_at,created_at,updated_at,version,deleted) values (?, 'PLATFORM', ?, '', '{}', ?, ?, 'admin', current_timestamp, current_timestamp, current_timestamp, 0, false)",
                Ids.uuid("SUBMIT"), id, request.approved() ? "APPROVED" : "REJECTED", request.note());
        if (request.approved()) jdbc.update("update catalog_product set enabled=true, updated_at=current_timestamp, version=version+1 where id=?", id);
        return ApiResponse.ok(true);
    }

    private Map<String, Object> upsertPrice(String id, PriceRequest request) {
        String priceId = id == null ? Ids.uuid("PRICE") : id;
        if (id == null) {
            jdbc.update("insert into catalog_price_policy(id,tenant_id,name,scope,target_id,discount_rate,enabled,created_at,updated_at,version,deleted) values (?, 'PLATFORM', ?, ?, ?, ?, ?, current_timestamp, current_timestamp, 0, false)",
                    priceId, request.name(), request.scope(), request.targetId(), request.discountRate() == null ? 1.0 : request.discountRate(), request.enabled() == null || request.enabled());
        } else {
            int updated = jdbc.update("update catalog_price_policy set name=?, scope=?, target_id=?, discount_rate=?, enabled=?, updated_at=current_timestamp, version=version+1 where id=? and deleted=false",
                    request.name(), request.scope(), request.targetId(), request.discountRate() == null ? 1.0 : request.discountRate(), request.enabled() == null || request.enabled(), id);
            if (updated != 1) throw new BusinessException(ErrorCode.NOT_FOUND, "价格策略不存在");
        }
        return jdbc.queryForMap("select id, name, scope, target_id, discount_rate, enabled from catalog_price_policy where id=?", priceId);
    }

    private Map<String, Object> findCategory(String id) { return jdbc.queryForMap("select id, code, name, icon, sort_order, enabled from catalog_category where id=?", id); }

    private Map<String, Object> findProduct(String id) {
        Map<String, Object> product = jdbc.queryForMap("select id, supplier_id, name, category, channel, enabled from catalog_product where id=?", id);
        product.put("skus", jdbc.queryForList("select id, name, price_cents, enabled from catalog_sku where product_id=? and deleted=false", id));
        return product;
    }
}

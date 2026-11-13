package com.agritainmen.catalog.web;

import com.agritainmen.common.core.ApiResponse;
import com.agritainmen.common.core.Ids;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/catalog")
public class CatalogPricingController {
    private final JdbcTemplate jdbc;
    public CatalogPricingController(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    public record BatchPriceRequest(java.util.List<PriceItem> items, String scope) {}
    public record PriceItem(String id, Double discountRate, Boolean enabled) {}

    @PutMapping("/prices")
    @org.springframework.transaction.annotation.Transactional
    public ApiResponse<Integer> batchUpdatePrices(@RequestBody BatchPriceRequest request) {
        int changed = 0;
        if (request.items() != null) {
            for (PriceItem item : request.items()) {
                changed += jdbc.update("update catalog_price_policy set discount_rate=?, enabled=?, updated_at=current_timestamp, version=version+1 where id=? and deleted=false",
                        item.discountRate() == null ? 1.0 : item.discountRate(), item.enabled() == null || item.enabled(), item.id());
            }
        }
        return ApiResponse.ok(changed);
    }
    public record PricingDefaultsRequest(Double storeLevelARate, Double storeLevelBRate, Double storeLevelCRate) {}
    @PutMapping("/pricing-defaults")
    public ApiResponse<Map<String, Object>> updateDefaults(@RequestBody PricingDefaultsRequest request) {
        Integer count = jdbc.queryForObject("select count(*) from catalog_pricing_default where deleted=false", Integer.class);
        if (count == null || count == 0) {
            jdbc.update("insert into catalog_pricing_default(id,tenant_id,store_level_a_rate,store_level_b_rate,store_level_c_rate,created_at,updated_at,version,deleted) values (?, 'PLATFORM', ?, ?, ?, current_timestamp, current_timestamp, 0, false)",
                    Ids.uuid("PRICING"), request.storeLevelARate() == null ? 0.95 : request.storeLevelARate(),
                    request.storeLevelBRate() == null ? 0.97 : request.storeLevelBRate(),
                    request.storeLevelCRate() == null ? 1.0 : request.storeLevelCRate());
        } else {
            jdbc.update("update catalog_pricing_default set store_level_a_rate=?, store_level_b_rate=?, store_level_c_rate=?, updated_at=current_timestamp, version=version+1 where deleted=false",
                    request.storeLevelARate() == null ? 0.95 : request.storeLevelARate(),
                    request.storeLevelBRate() == null ? 0.97 : request.storeLevelBRate(),
                    request.storeLevelCRate() == null ? 1.0 : request.storeLevelCRate());
        }
        return ApiResponse.ok(jdbc.queryForMap("select id, store_level_a_rate, store_level_b_rate, store_level_c_rate from catalog_pricing_default where deleted=false limit 1"));
    }
}

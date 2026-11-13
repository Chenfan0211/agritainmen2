package com.agritainmen.catalog;

import com.agritainmen.catalog.service.CatalogService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.junit.jupiter.api.Assertions.assertEquals;

@SpringBootTest(properties = "spring.profiles.active=test")
class CatalogServiceTest {
    @Autowired
    private CatalogService catalogService;
    @Autowired
    private JdbcTemplate jdbc;

    @Test
    void quoteUsesServerStoredSkuPrice() {
        jdbc.update("insert into catalog_product(id,tenant_id,supplier_id,name,category,channel,enabled,created_at,updated_at,version,deleted) values ('P-1','PLATFORM','S-1','测试商品','土特产','store',true,current_timestamp,current_timestamp,0,false)");
        jdbc.update("insert into catalog_sku(id,tenant_id,product_id,name,price_cents,enabled,created_at,updated_at,version,deleted) values ('SKU-1','PLATFORM','P-1','500g',5990,true,current_timestamp,current_timestamp,0,false)");
        var quote = catalogService.quote("SKU-1");
        assertEquals(5990L, quote.unitPriceCents());
        assertEquals("S-1", quote.supplierId());
    }
}

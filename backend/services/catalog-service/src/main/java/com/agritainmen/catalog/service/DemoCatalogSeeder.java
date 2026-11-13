package com.agritainmen.catalog.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class DemoCatalogSeeder implements ApplicationRunner {
    private final JdbcTemplate jdbc;
    private final boolean enabled;
    public DemoCatalogSeeder(JdbcTemplate jdbc, @Value("${agritainmen.demo.seed-enabled:false}") boolean enabled) { this.jdbc = jdbc; this.enabled = enabled; }
    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (!enabled) return;
        if (count("catalog_product", "P-DEMO-001") == 0) {
            jdbc.update("insert into catalog_product(id,tenant_id,supplier_id,name,category,channel,enabled,created_at,updated_at,version,deleted) values ('P-DEMO-001','PLATFORM','S-DEMO-001','演示生鲜礼盒','生鲜农产','store,user',true,current_timestamp,current_timestamp,0,false)");
        }
        if (count("catalog_sku", "SKU-DEMO-001") == 0) {
            jdbc.update("insert into catalog_sku(id,tenant_id,product_id,name,price_cents,enabled,created_at,updated_at,version,deleted) values ('SKU-DEMO-001','PLATFORM','P-DEMO-001','标准装',5990,true,current_timestamp,current_timestamp,0,false)");
        }
    }
    private int count(String table, String id) {
        Integer value = jdbc.queryForObject("select count(*) from " + table + " where id=?", Integer.class, id);
        return value == null ? 0 : value;
    }
}

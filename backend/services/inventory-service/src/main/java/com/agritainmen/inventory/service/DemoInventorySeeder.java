package com.agritainmen.inventory.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class DemoInventorySeeder implements ApplicationRunner {
    private final JdbcTemplate jdbc;
    private final boolean enabled;
    public DemoInventorySeeder(JdbcTemplate jdbc, @Value("${agritainmen.demo.seed-enabled:false}") boolean enabled) { this.jdbc = jdbc; this.enabled = enabled; }
    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (!enabled) return;
        if (count("inventory_stock", "STOCK-DEMO-001") == 0) {
            jdbc.update("insert into inventory_stock(id,tenant_id,sku_id,available_qty,reserved_qty,created_at,updated_at,version,deleted) values ('STOCK-DEMO-001','PLATFORM','SKU-DEMO-001',99,1,current_timestamp,current_timestamp,0,false)");
        }
        if (count("inventory_reservation", "RES-DEMO-001") == 0) {
            jdbc.update("insert into inventory_reservation(id,tenant_id,reservation_no,order_id,status,expires_at,created_at,updated_at,version,deleted) values ('RES-DEMO-001','PLATFORM','R-DEMO-001','ORDER-DEMO-001','RESERVED',timestampadd(DAY, 30, current_timestamp),current_timestamp,current_timestamp,0,false)");
            jdbc.update("insert into inventory_reservation_item(id,tenant_id,reservation_id,sku_id,quantity,created_at,updated_at,version,deleted) values ('RESITEM-DEMO-001','PLATFORM','RES-DEMO-001','SKU-DEMO-001',1,current_timestamp,current_timestamp,0,false)");
        }
    }
    private int count(String table, String id) {
        Integer value = jdbc.queryForObject("select count(*) from " + table + " where id=?", Integer.class, id);
        return value == null ? 0 : value;
    }
}

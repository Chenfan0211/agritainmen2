package com.agritainmen.fulfillment.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class DemoFulfillmentSeeder implements ApplicationRunner {
    private final JdbcTemplate jdbc;
    private final boolean enabled;
    public DemoFulfillmentSeeder(JdbcTemplate jdbc, @Value("${agritainmen.demo.seed-enabled:false}") boolean enabled) { this.jdbc = jdbc; this.enabled = enabled; }
    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (!enabled) return;
        Integer count = jdbc.queryForObject("select count(*) from fulfillment_order where id='FUL-DEMO-001'", Integer.class);
        if (count == null || count == 0) {
            jdbc.update("insert into fulfillment_order(id,tenant_id,order_id,supplier_id,status,created_at,updated_at,version,deleted) values ('FUL-DEMO-001','PLATFORM','ORDER-DEMO-001','S-DEMO-001','PENDING',current_timestamp,current_timestamp,0,false)");
        }
    }
}

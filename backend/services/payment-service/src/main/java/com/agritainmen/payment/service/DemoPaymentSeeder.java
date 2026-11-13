package com.agritainmen.payment.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class DemoPaymentSeeder implements ApplicationRunner {
    private final JdbcTemplate jdbc;
    private final boolean enabled;
    public DemoPaymentSeeder(JdbcTemplate jdbc, @Value("${agritainmen.demo.seed-enabled:false}") boolean enabled) { this.jdbc = jdbc; this.enabled = enabled; }
    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (!enabled) return;
        Integer count = jdbc.queryForObject("select count(*) from payment_intent where id='PAY-DEMO-001'", Integer.class);
        if (count == null || count == 0) {
            jdbc.update("insert into payment_intent(id,tenant_id,order_id,amount_cents,channel,status,created_at,updated_at,version,deleted) values ('PAY-DEMO-001','PLATFORM','ORDER-DEMO-001',5990,'WECHAT','CREATED',current_timestamp,current_timestamp,0,false)");
        }
    }
}

package com.agritainmen.settlement.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class DemoSettlementSeeder implements ApplicationRunner {
    private final JdbcTemplate jdbc;
    private final boolean enabled;
    public DemoSettlementSeeder(JdbcTemplate jdbc, @Value("${agritainmen.demo.seed-enabled:false}") boolean enabled) { this.jdbc = jdbc; this.enabled = enabled; }
    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (!enabled) return;
        if (count("settlement_commission", "COMMISSION-DEMO-001") == 0) {
            jdbc.update("insert into settlement_commission(id,tenant_id,source_id,beneficiary_id,amount_cents,direction,status,created_at,updated_at,version,deleted) values ('COMMISSION-DEMO-001','PLATFORM','ORDER-DEMO-001','T001',500,'LEVEL_1','AVAILABLE',current_timestamp,current_timestamp,0,false)");
        }
        if (count("settlement_withdrawal", "WITHDRAWAL-DEMO-001") == 0) {
            jdbc.update("insert into settlement_withdrawal(id,tenant_id,requester_id,amount_cents,method,status,created_at,updated_at,version,deleted) values ('WITHDRAWAL-DEMO-001','PLATFORM','T001',200,'微信零钱','PENDING',current_timestamp,current_timestamp,0,false)");
        }
    }
    private int count(String table, String id) {
        Integer value = jdbc.queryForObject("select count(*) from " + table + " where id=?", Integer.class, id);
        return value == null ? 0 : value;
    }
}

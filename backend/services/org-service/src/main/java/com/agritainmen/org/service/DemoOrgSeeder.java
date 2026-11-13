package com.agritainmen.org.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class DemoOrgSeeder implements ApplicationRunner {
    private final JdbcTemplate jdbc;
    private final boolean enabled;

    public DemoOrgSeeder(JdbcTemplate jdbc, @Value("${agritainmen.demo.seed-enabled:false}") boolean enabled) {
        this.jdbc = jdbc;
        this.enabled = enabled;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (!enabled) return;
        seed("org_supplier", "S-DEMO-001", "insert into org_supplier(id,tenant_id,name,contact_phone,region,category,status,certified,created_at,updated_at,version,deleted) values (?, 'PLATFORM', '演示生鲜供应商', '13787366688', '湖南省湘西州', '生鲜/腊味', 'cooperating', true, current_timestamp, current_timestamp, 0, false)");
        seed("org_farm", "F-DEMO-001", "insert into org_farm(id,tenant_id,name,region,status,created_at,updated_at,version,deleted) values (?, 'PLATFORM', '演示门店', '湖南省长沙市', 'active', current_timestamp, current_timestamp, 0, false)");
        seed("org_driver", "D-DEMO-001", "insert into org_driver(id,tenant_id,supplier_id,name,phone,status,created_at,updated_at,version,deleted) values (?, 'PLATFORM', 'S-DEMO-001', '演示司机', '13900000001', 'active', current_timestamp, current_timestamp, 0, false)");
        seed("org_leader", "T001", "insert into org_leader(id,tenant_id,name,level,leader_id,parent_leader_id,status,created_at,updated_at,version,deleted) values (?, 'PLATFORM', '一级团长', 'level1', ?, null, 'active', current_timestamp, current_timestamp, 0, false)", "");
        seed("org_leader", "T002", "insert into org_leader(id,tenant_id,name,level,leader_id,parent_leader_id,status,created_at,updated_at,version,deleted) values (?, 'PLATFORM', '二级团长', 'level2', ?, 'T001', 'active', current_timestamp, current_timestamp, 0, false)", "T001");
    }

    private void seed(String table, String id, String sql, Object... extra) {
        Integer count = jdbc.queryForObject("select count(*) from " + table + " where id=?", Integer.class, id);
        if (count != null && count > 0) return;
        Object[] params = new Object[extra.length + 1];
        params[0] = id;
        System.arraycopy(extra, 0, params, 1, extra.length);
        jdbc.update(sql, params);
    }
}

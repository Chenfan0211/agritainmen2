package com.agritainmen.admin.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class DemoAdminSeeder implements ApplicationRunner {
    private final JdbcTemplate jdbc;
    private final boolean enabled;
    public DemoAdminSeeder(JdbcTemplate jdbc, @Value("${agritainmen.demo.seed-enabled:false}") boolean enabled) { this.jdbc = jdbc; this.enabled = enabled; }
    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (!enabled) return;
        if (count("admin_dictionary", "DICT-DEMO-001") == 0) {
            jdbc.update("insert into admin_dictionary(id,tenant_id,group_code,item_code,label,sort_order,enabled,created_at,updated_at,version,deleted) values ('DICT-DEMO-001','PLATFORM','systemStatus','demoEnabled','演示环境启用',1,true,current_timestamp,current_timestamp,0,false)");
        }
        if (count("admin_audit_log", "AUDIT-DEMO-001") == 0) {
            jdbc.update("insert into admin_audit_log(id,tenant_id,actor_id,actor_role,module,action,target_id,result,reason,created_at) values ('AUDIT-DEMO-001','PLATFORM','AA-DEMO','super_admin','system','demo.seed','PLATFORM','success',null,current_timestamp)");
        }
    }
    private int count(String table, String id) {
        Integer value = jdbc.queryForObject("select count(*) from " + table + " where id=?", Integer.class, id);
        return value == null ? 0 : value;
    }
}

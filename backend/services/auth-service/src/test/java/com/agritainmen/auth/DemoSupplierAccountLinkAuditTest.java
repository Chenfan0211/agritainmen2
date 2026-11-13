package com.agritainmen.auth;

import com.agritainmen.auth.service.DemoAuthSeeder;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.boot.DefaultApplicationArguments;

import static org.junit.jupiter.api.Assertions.assertEquals;

@Tag("api-audit")
@SpringBootTest(properties = {"spring.profiles.active=test",
        "spring.datasource.url=jdbc:h2:mem:auth_seed_link_test;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"})
class DemoSupplierAccountLinkAuditTest {
    @Autowired JdbcTemplate jdbc;
    @Autowired DemoAuthSeeder seeder;

    @Test
    void freshDemoSupplierAccountIsLinkedToKnownDemoSupplier() {
        assertEquals("S-DEMO-001", jdbc.queryForObject("""
                select supplier_id from auth_account
                where actor_type='supplier' and account='13787366688'
                """, String.class));
        jdbc.update("update auth_account set supplier_id=null where actor_type='supplier' and account='13787366688'");
        seeder.run(new DefaultApplicationArguments(new String[0]));
        assertEquals(null, jdbc.queryForObject("""
                select supplier_id from auth_account
                where actor_type='supplier' and account='13787366688'
                """, String.class));
    }
}

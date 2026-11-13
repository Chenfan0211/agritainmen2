package com.agritainmen.admin;

import com.agritainmen.admin.web.AdminPlatformController;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import static org.junit.jupiter.api.Assertions.assertEquals;

@SpringBootTest(properties = "spring.profiles.active=test")
class AdminPlatformControllerTest {
    @Autowired
    private AdminPlatformController controller;

    @Test
    void auditLogKeepsOperatorAndResult() {
        controller.audit(new AdminPlatformController.AuditRequest("AA-1", "super_admin", "orders", "order.ship", "ORDER-1", "success", null));
        var rows = controller.auditList().data();
        assertEquals(1, rows.size());
        assertEquals("order.ship", rows.get(0).get("action"));
    }
}

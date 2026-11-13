package com.agritainmen.notification;

import com.agritainmen.notification.web.NotificationController;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest(properties = "spring.profiles.active=test")
class SmsProviderTest {
    @Autowired private NotificationController controller;
    @Test void sandboxSmsUsesFixedTestCode() {
        var sent = controller.sendCode(new NotificationController.SendCodeRequest("13800000000")).data();
        assertEquals("123456", sent.testCode());
        assertTrue(controller.verify(new NotificationController.VerifyCodeRequest("13800000000", "123456")).data());
    }
}

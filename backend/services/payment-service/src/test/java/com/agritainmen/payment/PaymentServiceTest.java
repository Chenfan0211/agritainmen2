package com.agritainmen.payment;

import com.agritainmen.payment.service.PaymentService;
import com.agritainmen.payment.web.PaymentDtos.CallbackRequest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.junit.jupiter.api.Assertions.assertEquals;

@SpringBootTest(properties = "spring.profiles.active=test")
class PaymentServiceTest {
    @Autowired
    private PaymentService paymentService;
    @Autowired
    private JdbcTemplate jdbc;

    @Test
    void duplicateCallbackDoesNotChangeStateTwice() {
        paymentService.create("ORDER-1", 5990, "WECHAT");
        CallbackRequest callback = new CallbackRequest("WECHAT", "TXN-1", "ORDER-1", true, null);
        assertEquals("PAID", paymentService.callback(callback).status());
        assertEquals("PAID", paymentService.callback(callback).status());
        Integer events = jdbc.queryForObject("select count(*) from payment_callback_event where provider_txn_id='TXN-1'", Integer.class);
        assertEquals(1, events);
    }
}

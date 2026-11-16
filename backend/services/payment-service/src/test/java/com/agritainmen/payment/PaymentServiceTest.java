package com.agritainmen.payment;

import com.agritainmen.common.core.BusinessException;
import com.agritainmen.payment.client.OrderPaymentClient;
import com.agritainmen.payment.service.PaymentService;
import com.agritainmen.payment.web.PaymentDtos.CallbackRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

@SpringBootTest(properties = "spring.profiles.active=test")
@Import(PaymentServiceTest.FakeOrderConfiguration.class)
class PaymentServiceTest {
    @Autowired
    private PaymentService paymentService;
    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private FakeOrderClient orders;

    @BeforeEach void reset() {
        orders.unavailable.set(false);
        orders.cancelled.set(false);
        orders.confirmCalls.set(0);
    }

    @Test
    void duplicateCallbackDoesNotChangeStateTwice() {
        String orderId = "ORDER-" + UUID.randomUUID();
        String transactionId = "TXN-" + UUID.randomUUID();
        paymentService.create(orderId, 5990, "WECHAT", "Bearer buyer-a");
        CallbackRequest callback = new CallbackRequest("WECHAT", transactionId, orderId, true, null);
        assertEquals("PAID", paymentService.callback(callback).status());
        assertEquals("PAID", paymentService.callback(callback).status());
        Integer events = jdbc.queryForObject("select count(*) from payment_callback_event where provider_txn_id=?", Integer.class, transactionId);
        assertEquals(1, events);
        assertEquals(1, orders.confirmCalls.get());
        assertThrows(BusinessException.class, () -> paymentService.callback(
                new CallbackRequest("WECHAT", "TXN-" + UUID.randomUUID(), orderId, true, null)));
        assertEquals(1, orders.confirmCalls.get());
    }

    @Test
    void intentRequiresBuyerAccessAndExactOrderAmount() {
        String orderId = "ORDER-" + UUID.randomUUID();
        assertThrows(BusinessException.class, () -> paymentService.create(orderId, 5990, "WECHAT", "Bearer other"));
        assertThrows(BusinessException.class, () -> paymentService.create(orderId, 6000, "WECHAT", "Bearer buyer-a"));
        assertEquals(0, jdbc.queryForObject("select count(*) from payment_intent where order_id=?", Integer.class, orderId));
    }

    @Test
    void cancelledOrderAfterProviderSuccessNeedsRefund() {
        String orderId = "ORDER-" + UUID.randomUUID();
        paymentService.create(orderId, 5990, "WECHAT", "Bearer buyer-a");
        orders.cancelled.set(true);
        assertEquals("REFUND_REQUIRED", paymentService.callback(new CallbackRequest("WECHAT", "TXN-" + UUID.randomUUID(), orderId, true, null)).status());
        assertEquals("REFUND_REQUIRED", paymentService.findByOrder(orderId).status());
    }

    @Test
    void unavailableOrderServiceLeavesDurablePendingStateForRetry() {
        String orderId = "ORDER-" + UUID.randomUUID();
        paymentService.create(orderId, 5990, "WECHAT", "Bearer buyer-a");
        orders.unavailable.set(true);
        assertEquals("PAID_PENDING_ORDER", paymentService.callback(new CallbackRequest("WECHAT", "TXN-" + UUID.randomUUID(), orderId, true, null)).status());
        assertEquals("PAID_PENDING_ORDER", paymentService.findByOrder(orderId).status());
        orders.unavailable.set(false);
        paymentService.reconcilePending();
        assertEquals("PAID", paymentService.findByOrder(orderId).status());
    }

    @Test
    void failedProviderCallbackDoesNotConfirmOrder() {
        String orderId = "ORDER-" + UUID.randomUUID();
        paymentService.create(orderId, 5990, "WECHAT", "Bearer buyer-a");
        assertEquals("FAILED", paymentService.callback(new CallbackRequest("WECHAT", "TXN-" + UUID.randomUUID(), orderId, false, "failed")).status());
        assertEquals(0, orders.confirmCalls.get());
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class FakeOrderConfiguration {
        @Bean @Primary FakeOrderClient fakeOrderClient() { return new FakeOrderClient(); }
    }

    static class FakeOrderClient implements OrderPaymentClient {
        final AtomicBoolean cancelled = new AtomicBoolean();
        final AtomicBoolean unavailable = new AtomicBoolean();
        final AtomicInteger confirmCalls = new AtomicInteger();
        @Override public OrderSnapshot load(String orderId, String authorization) {
            if (!"Bearer buyer-a".equals(authorization)) throw new BusinessException(com.agritainmen.common.core.ErrorCode.UNAUTHORIZED);
            return new OrderSnapshot(orderId, 5990, "PENDING_PAYMENT");
        }
        @Override public String confirm(String orderId, long amountCents) {
            confirmCalls.incrementAndGet();
            if (unavailable.get()) throw new IllegalStateException("订单服务暂不可用");
            return cancelled.get() ? "UNPAID_CANCELLED" : "PAID";
        }
    }
}

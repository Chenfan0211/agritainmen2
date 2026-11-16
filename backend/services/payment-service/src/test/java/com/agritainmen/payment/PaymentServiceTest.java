package com.agritainmen.payment;

import com.agritainmen.common.core.BusinessException;
import com.agritainmen.payment.client.OrderPaymentClient;
import com.agritainmen.payment.provider.SandboxPaymentProvider;
import com.agritainmen.payment.provider.WechatV3PaymentProvider;
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
import org.springframework.dao.DataAccessException;

import java.util.UUID;
import java.sql.Timestamp;
import java.util.Set;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest(properties = "spring.profiles.active=test")
@Import(PaymentServiceTest.FakeOrderConfiguration.class)
class PaymentServiceTest {
    @Autowired
    private PaymentService paymentService;
    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private FakeOrderClient orders;
    @Autowired
    private FakePaymentProvider provider;

    @BeforeEach void reset() {
        orders.unavailable.set(false);
        orders.cancelled.set(false);
        orders.confirmCalls.set(0);
        provider.failRefund.set(false);
        provider.loseAcknowledgement.set(false);
        provider.refundExecutions.set(0);
        provider.refundedIds.clear();
        provider.requestIds.clear();
        provider.failRefundTxnIds.clear();
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
        assertEquals("REFUNDED", paymentService.callback(new CallbackRequest("WECHAT", "TXN-" + UUID.randomUUID(), orderId, true, null)).status());
        assertEquals("REFUNDED", paymentService.findByOrder(orderId).status());
        assertEquals(1, provider.refundExecutions.get());
        assertEquals(List.of("REFUND-" + paymentService.findByOrder(orderId).id()), provider.requestIds);
    }

    @Test
    void failedRefundRemainsPendingAndDuplicateCallbackRetriesSameRequest() {
        String orderId = "ORDER-" + UUID.randomUUID();
        String transactionId = "TXN-" + UUID.randomUUID();
        paymentService.create(orderId, 5990, "WECHAT", "Bearer buyer-a");
        orders.cancelled.set(true);
        CallbackRequest callback = new CallbackRequest("WECHAT", transactionId, orderId, true, null);
        provider.failRefund.set(true);
        assertEquals("REFUND_REQUIRED", paymentService.callback(callback).status());
        assertEquals(0, provider.refundExecutions.get());
        provider.failRefund.set(false);
        assertEquals("REFUNDED", paymentService.callback(callback).status());
        assertEquals(1, provider.refundExecutions.get());
        assertEquals(List.of(provider.requestIds.get(0), provider.requestIds.get(0)), provider.requestIds);
        assertEquals(1, jdbc.queryForObject("select count(*) from sys_outbox_event where aggregate_id=? and event_type='payment.refunded'",
                Integer.class, paymentService.findByOrder(orderId).id()));
    }

    @Test
    void lostRefundAcknowledgementIsRecoveredByScheduledRetry() {
        String orderId = "ORDER-" + UUID.randomUUID();
        paymentService.create(orderId, 5990, "WECHAT", "Bearer buyer-a");
        orders.cancelled.set(true);
        provider.loseAcknowledgement.set(true);
        assertEquals("REFUND_REQUIRED", paymentService.callback(new CallbackRequest("WECHAT", "TXN-" + UUID.randomUUID(), orderId, true, null)).status());
        assertEquals(1, provider.refundExecutions.get());
        provider.loseAcknowledgement.set(false);
        paymentService.retryRefunds();
        assertEquals("REFUNDED", paymentService.findByOrder(orderId).status());
        assertEquals(1, provider.refundExecutions.get());
        assertEquals(List.of(provider.requestIds.get(0), provider.requestIds.get(0)), provider.requestIds);
    }

    @Test
    void refundConfirmationCommitFailureRetriesWithoutNewProviderRefund() {
        String orderId = "ORDER-" + UUID.randomUUID();
        var intent = paymentService.create(orderId, 5990, "WECHAT", "Bearer buyer-a");
        orders.cancelled.set(true);
        jdbc.execute("alter table payment_intent add constraint ck_payment_refund_block_test check (id <> '"
                + intent.id() + "' or status <> 'REFUNDED')");
        try {
            assertThrows(DataAccessException.class, () -> paymentService.callback(
                    new CallbackRequest("WECHAT", "TXN-" + UUID.randomUUID(), orderId, true, null)));
            assertEquals("REFUND_REQUIRED", paymentService.findByOrder(orderId).status());
            assertEquals(1, provider.refundExecutions.get());
        } finally {
            jdbc.execute("alter table payment_intent drop constraint ck_payment_refund_block_test");
        }
        paymentService.retryRefunds();
        assertEquals("REFUNDED", paymentService.findByOrder(orderId).status());
        assertEquals(1, provider.refundExecutions.get());
    }

    @Test
    void oneFailedRefundDoesNotBlockOtherPendingPayments() {
        String first = "ORDER-" + UUID.randomUUID();
        String second = "ORDER-" + UUID.randomUUID();
        paymentService.create(first, 5990, "WECHAT", "Bearer buyer-a");
        paymentService.create(second, 5990, "WECHAT", "Bearer buyer-a");
        orders.cancelled.set(true);
        provider.failRefund.set(true);
        String firstTxn = "TXN-" + UUID.randomUUID();
        paymentService.callback(new CallbackRequest("WECHAT", firstTxn, first, true, null));
        paymentService.callback(new CallbackRequest("WECHAT", "TXN-" + UUID.randomUUID(), second, true, null));
        provider.failRefund.set(false);
        provider.failRefundTxnIds.add(firstTxn);
        try {
            paymentService.retryRefunds();
            assertEquals("REFUND_REQUIRED", paymentService.findByOrder(first).status());
            assertEquals("REFUNDED", paymentService.findByOrder(second).status());
        } finally {
            provider.failRefundTxnIds.clear();
        }
        paymentService.retryRefunds();
        assertEquals("REFUNDED", paymentService.findByOrder(first).status());
    }

    @Test
    void missingProviderTransactionRotatesRefundQueue() {
        String orderId = "ORDER-" + UUID.randomUUID();
        String transactionId = "TXN-" + UUID.randomUUID();
        paymentService.create(orderId, 5990, "WECHAT", "Bearer buyer-a");
        orders.cancelled.set(true);
        provider.failRefund.set(true);
        paymentService.callback(new CallbackRequest("WECHAT", transactionId, orderId, true, null));
        provider.failRefund.set(false);
        Timestamp old = Timestamp.valueOf("2000-01-01 00:00:00");
        jdbc.update("update payment_intent set provider_txn_id=null, updated_at=? where order_id=?", old, orderId);

        paymentService.retryRefunds();

        assertEquals("REFUND_REQUIRED", paymentService.findByOrder(orderId).status());
        Timestamp updated = jdbc.queryForObject("select updated_at from payment_intent where order_id=?", Timestamp.class, orderId);
        assertTrue(updated.after(old));
        jdbc.update("update payment_intent set provider_txn_id=? where order_id=?", transactionId, orderId);
        paymentService.retryRefunds();
        assertEquals("REFUNDED", paymentService.findByOrder(orderId).status());
    }

    @Test
    void unconfiguredWechatProviderRejectsRefund() {
        assertThrows(BusinessException.class, () -> new WechatV3PaymentProvider().refund("TXN-1", "REFUND-1", 5990));
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
        @Bean @Primary FakePaymentProvider fakePaymentProvider() { return new FakePaymentProvider(); }
    }

    static class FakePaymentProvider extends SandboxPaymentProvider {
        final AtomicBoolean failRefund = new AtomicBoolean();
        final AtomicBoolean loseAcknowledgement = new AtomicBoolean();
        final AtomicInteger refundExecutions = new AtomicInteger();
        final Set<String> refundedIds = ConcurrentHashMap.newKeySet();
        final Set<String> failRefundTxnIds = ConcurrentHashMap.newKeySet();
        final List<String> requestIds = new CopyOnWriteArrayList<>();

        @Override
        public boolean refund(String providerTxnId, String refundRequestId, long amountCents) {
            requestIds.add(refundRequestId);
            if (failRefund.get() || failRefundTxnIds.contains(providerTxnId)) throw new IllegalStateException("退款渠道不可用");
            if (refundedIds.add(refundRequestId)) refundExecutions.incrementAndGet();
            if (loseAcknowledgement.get()) throw new IllegalStateException("退款响应丢失");
            return true;
        }
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

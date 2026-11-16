package com.agritainmen.order;

import com.agritainmen.order.client.CatalogClient;
import com.agritainmen.order.client.InventoryClient;
import com.agritainmen.order.service.OrderService;
import com.agritainmen.order.web.OrderDtos.CreateOrderRequest;
import com.agritainmen.order.web.OrderDtos.OrderLineRequest;
import com.agritainmen.order.web.OrderDtos.OrderView;
import com.agritainmen.order.web.OrderDtos.PriceQuote;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.dao.DataAccessException;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Consumer;

import static org.junit.jupiter.api.Assertions.assertEquals;

@SpringBootTest(properties = "spring.profiles.active=test")
@Import(OrderServiceTest.FakeClients.class)
class OrderServiceTest {
    @Autowired
    private OrderService orderService;
    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private FakeInventoryClient inventory;

    @Test
    void createOrderUsesServerPriceAndReplaysIdempotencyKey() {
        Integer before = jdbc.queryForObject("select count(*) from trade_order", Integer.class);
        CreateOrderRequest request = new CreateOrderRequest("U1", List.of(new OrderLineRequest("SKU-1", 2)),
                "张三", "13800000000", "湖南省长沙市");
        OrderView first = orderService.create("ORDER-IDEM-1", request);
        OrderView second = orderService.create("ORDER-IDEM-1", request);
        assertEquals(first.id(), second.id());
        assertEquals(11980L, first.amountCents());
        assertEquals("PENDING_PAYMENT", first.status());
        org.junit.jupiter.api.Assertions.assertTrue(first.reservationId().startsWith("RES-ORDER-"));
        Integer count = jdbc.queryForObject("select count(*) from trade_order", Integer.class);
        assertEquals(before + 1, count);
    }

    @Test
    void cancelPendingReleasesReservationOnceAndRejectsOtherStatuses() {
        String key = "CANCEL-" + UUID.randomUUID();
        OrderView created = orderService.create(key, new CreateOrderRequest("F1", List.of(new OrderLineRequest("SKU-1", 1)),
                "张三", "13800000000", "湖南省长沙市"));
        int before = inventory.releases.get();
        assertEquals("UNPAID_CANCELLED", orderService.cancelPending(created.id()).status());
        assertEquals("UNPAID_CANCELLED", orderService.cancelPending(created.id()).status());
        assertEquals(before + 1, inventory.releases.get());
        assertEquals("UNPAID_CANCELLED", orderService.find(created.id()).status());
        jdbc.update("update trade_order set status='PAID' where id=?", created.id());
        org.junit.jupiter.api.Assertions.assertThrows(com.agritainmen.common.core.BusinessException.class,
                () -> orderService.cancelPending(created.id()));
        assertEquals(before + 1, inventory.releases.get());
    }

    @Test
    void failedInventoryReleaseKeepsDurableCancellationForRetry() {
        String key = "CANCEL-FAIL-" + UUID.randomUUID();
        OrderView created = orderService.create(key, new CreateOrderRequest("F1", List.of(new OrderLineRequest("SKU-1", 1)),
                "张三", "13800000000", "湖南省长沙市"));
        inventory.failRelease.set(true);
        try {
            assertEquals("UNPAID_CANCELLED", orderService.cancelPending(created.id()).status());
            assertEquals(true, releasePending(created.id()));
            assertEquals("UNPAID_CANCELLED", orderService.confirmPaid(created.id(), created.amountCents()).status());
        } finally {
            inventory.failRelease.set(false);
        }
        orderService.retryPendingReleases();
        assertEquals(false, releasePending(created.id()));
        assertEquals("UNPAID_CANCELLED", orderService.find(created.id()).status());
    }

    @Test
    void cancellationCommitsBeforeCallingInventoryRelease() {
        OrderView order = createForPayment();
        AtomicBoolean checked = new AtomicBoolean();
        inventory.onRelease = reservationId -> {
            if (!order.reservationId().equals(reservationId)) return;
            assertEquals(false, TransactionSynchronizationManager.isActualTransactionActive());
            assertEquals("UNPAID_CANCELLED", jdbc.queryForObject(
                    "select status from trade_order where id=?", String.class, order.id()));
            assertEquals(true, releasePending(order.id()));
            checked.set(true);
        };
        try {
            orderService.cancelPending(order.id());
            assertEquals(true, checked.get());
        } finally {
            inventory.onRelease = ignored -> {};
        }
    }

    @Test
    void duplicateCancellationRetriesReleaseAndLostAcknowledgementIsRecoverable() {
        OrderView order = createForPayment();
        int before = inventory.releases.get();
        inventory.failRelease.set(true);
        try {
            orderService.cancelPending(order.id());
        } finally {
            inventory.failRelease.set(false);
        }
        assertEquals(true, releasePending(order.id()));
        assertEquals("UNPAID_CANCELLED", orderService.cancelPending(order.id()).status());
        assertEquals(false, releasePending(order.id()));
        assertEquals(before + 1, inventory.releases.get());
        jdbc.update("update trade_order set release_pending=true where id=?", order.id());
        orderService.retryPendingReleases();
        assertEquals(false, releasePending(order.id()));
    }

    @Test
    void oneFailedReleaseDoesNotBlockOtherPendingOrders() {
        OrderView first = createForPayment();
        OrderView second = createForPayment();
        inventory.failRelease.set(true);
        try {
            orderService.cancelPending(first.id());
            orderService.cancelPending(second.id());
        } finally {
            inventory.failRelease.set(false);
        }
        inventory.failIds.add(first.reservationId());
        try {
            orderService.retryPendingReleases();
            assertEquals(true, releasePending(first.id()));
            assertEquals(false, releasePending(second.id()));
        } finally {
            inventory.failIds.clear();
        }
    }

    private Boolean releasePending(String orderId) {
        return jdbc.queryForObject("select release_pending from trade_order where id=?", Boolean.class, orderId);
    }

    @Test
    void paidConfirmationWinsCancellationAndConfirmsInventoryOnce() {
        OrderView order = createForPayment();
        int before = inventory.confirms.get();
        int releases = inventory.releases.get();
        assertEquals("PAID", orderService.confirmPaid(order.id(), order.amountCents()).status());
        assertEquals("PAID", orderService.confirmPaid(order.id(), order.amountCents()).status());
        assertEquals(before + 1, inventory.confirms.get());
        org.junit.jupiter.api.Assertions.assertThrows(com.agritainmen.common.core.BusinessException.class,
                () -> orderService.cancelPending(order.id()));
        assertEquals(releases, inventory.releases.get());
    }

    @Test
    void cancelledOrderCannotBePaidOrConfirmInventory() {
        OrderView order = createForPayment();
        int before = inventory.confirms.get();
        orderService.cancelPending(order.id());
        assertEquals("UNPAID_CANCELLED", orderService.confirmPaid(order.id(), order.amountCents()).status());
        assertEquals(before, inventory.confirms.get());
    }

    @Test
    void failedInventoryConfirmationOrWrongAmountKeepsOrderPending() {
        OrderView order = createForPayment();
        int before = inventory.confirms.get();
        org.junit.jupiter.api.Assertions.assertThrows(com.agritainmen.common.core.BusinessException.class,
                () -> orderService.confirmPaid(order.id(), order.amountCents() + 1));
        assertEquals(before, inventory.confirms.get());
        inventory.failConfirm.set(true);
        try {
            org.junit.jupiter.api.Assertions.assertThrows(IllegalStateException.class,
                    () -> orderService.confirmPaid(order.id(), order.amountCents()));
            assertEquals("PENDING_PAYMENT", orderService.find(order.id()).status());
        } finally {
            inventory.failConfirm.set(false);
        }
    }

    @Test
    void confirmedInventorySurvivesOrderCommitFailureAndBlocksCancellation() {
        OrderView order = createForPayment();
        int before = inventory.confirms.get();
        jdbc.execute("alter table trade_order add constraint ck_order_paid_block_test check (id <> '"
                + order.id() + "' or status <> 'PAID')");
        try {
            org.junit.jupiter.api.Assertions.assertThrows(DataAccessException.class,
                    () -> orderService.confirmPaid(order.id(), order.amountCents()));
            assertEquals("PENDING_PAYMENT", orderService.find(order.id()).status());
            assertEquals(true, confirmationPending(order.id()));
            org.junit.jupiter.api.Assertions.assertThrows(com.agritainmen.common.core.BusinessException.class,
                    () -> orderService.cancelPending(order.id()));
        } finally {
            jdbc.execute("alter table trade_order drop constraint ck_order_paid_block_test");
        }
        assertEquals("PAID", orderService.confirmPaid(order.id(), order.amountCents()).status());
        assertEquals(false, confirmationPending(order.id()));
        assertEquals(before + 1, inventory.confirms.get());
        assertEquals(1, jdbc.queryForObject("select count(*) from sys_outbox_event where aggregate_id=? and event_type='order.paid'",
                Integer.class, order.id()));
    }

    @Test
    void failedPaymentGuardCommitNeverCallsInventory() {
        OrderView order = createForPayment();
        int before = inventory.confirms.get();
        jdbc.execute("alter table trade_order add constraint ck_order_guard_block_test check (id <> '"
                + order.id() + "' or confirmation_pending=false)");
        try {
            org.junit.jupiter.api.Assertions.assertThrows(DataAccessException.class,
                    () -> orderService.confirmPaid(order.id(), order.amountCents()));
        } finally {
            jdbc.execute("alter table trade_order drop constraint ck_order_guard_block_test");
        }
        assertEquals(false, confirmationPending(order.id()));
        assertEquals(before, inventory.confirms.get());
        assertEquals("UNPAID_CANCELLED", orderService.cancelPending(order.id()).status());
    }

    @Test
    void unavailableInventoryKeepsPaymentConfirmationPending() {
        OrderView order = createForPayment();
        inventory.failConfirm.set(true);
        try {
            org.junit.jupiter.api.Assertions.assertThrows(IllegalStateException.class,
                    () -> orderService.confirmPaid(order.id(), order.amountCents()));
            assertEquals(true, confirmationPending(order.id()));
            org.junit.jupiter.api.Assertions.assertThrows(com.agritainmen.common.core.BusinessException.class,
                    () -> orderService.cancelPending(order.id()));
        } finally {
            inventory.failConfirm.set(false);
        }
        assertEquals("PAID", orderService.confirmPaid(order.id(), order.amountCents()).status());
        assertEquals(false, confirmationPending(order.id()));
    }

    @Test
    void scheduledPaymentConfirmationContinuesAfterOneFailure() {
        OrderView first = createForPayment();
        OrderView second = createForPayment();
        inventory.failConfirm.set(true);
        try {
            org.junit.jupiter.api.Assertions.assertThrows(IllegalStateException.class,
                    () -> orderService.confirmPaid(first.id(), first.amountCents()));
            org.junit.jupiter.api.Assertions.assertThrows(IllegalStateException.class,
                    () -> orderService.confirmPaid(second.id(), second.amountCents()));
        } finally {
            inventory.failConfirm.set(false);
        }
        jdbc.execute("alter table trade_order add constraint ck_order_paid_block_test check (id <> '"
                + first.id() + "' or status <> 'PAID')");
        try {
            orderService.retryPendingConfirmations();
            assertEquals(true, confirmationPending(first.id()));
            assertEquals("PAID", orderService.find(second.id()).status());
        } finally {
            jdbc.execute("alter table trade_order drop constraint ck_order_paid_block_test");
        }
        orderService.retryPendingConfirmations();
        assertEquals("PAID", orderService.find(first.id()).status());
    }

    @Test
    void paymentGuardCommitsBeforeInventoryConfirmation() {
        OrderView order = createForPayment();
        AtomicBoolean checked = new AtomicBoolean();
        inventory.onConfirm = reservationId -> {
            if (!order.reservationId().equals(reservationId)) return;
            assertEquals(false, TransactionSynchronizationManager.isActualTransactionActive());
            assertEquals(true, confirmationPending(order.id()));
            assertEquals("PENDING_PAYMENT", orderService.find(order.id()).status());
            checked.set(true);
        };
        try {
            assertEquals("PAID", orderService.confirmPaid(order.id(), order.amountCents()).status());
            assertEquals(true, checked.get());
        } finally {
            inventory.onConfirm = ignored -> {};
        }
    }

    private Boolean confirmationPending(String orderId) {
        return jdbc.queryForObject("select confirmation_pending from trade_order where id=?", Boolean.class, orderId);
    }

    private OrderView createForPayment() {
        return orderService.create("PAY-CONFIRM-" + UUID.randomUUID(),
                new CreateOrderRequest("F1", List.of(new OrderLineRequest("SKU-1", 1)),
                        "张三", "13800000000", "湖南省长沙市"));
    }

    @TestConfiguration
    static class FakeClients {
        @Bean
        @Primary
        CatalogClient catalogClient() {
            return skuId -> new PriceQuote(skuId, "P-1", "S-1", "测试商品", 5990L);
        }

        @Bean
        @Primary
        FakeInventoryClient inventoryClient() {
            return new FakeInventoryClient();
        }
    }

    static class FakeInventoryClient implements InventoryClient {
        final AtomicInteger releases = new AtomicInteger();
        final AtomicBoolean failRelease = new AtomicBoolean();
        final Set<String> failIds = ConcurrentHashMap.newKeySet();
        final AtomicInteger confirms = new AtomicInteger();
        final AtomicBoolean failConfirm = new AtomicBoolean();
        final Set<String> confirmedReservations = ConcurrentHashMap.newKeySet();
        volatile Consumer<String> onRelease = ignored -> {};
        volatile Consumer<String> onConfirm = ignored -> {};
        @Override public Reservation reserve(String orderId, List<Line> lines, java.time.Instant expiresAt) {
            return new Reservation("RES-" + orderId, orderId, "RESERVED");
        }
        @Override public Reservation release(String reservationId) {
            onRelease.accept(reservationId);
            if (failRelease.get() || failIds.contains(reservationId)) throw new IllegalStateException("库存服务不可用");
            releases.incrementAndGet();
            return new Reservation(reservationId, reservationId.substring(4), "RELEASED");
        }
        @Override public Reservation confirm(String reservationId) {
            onConfirm.accept(reservationId);
            if (failConfirm.get()) throw new IllegalStateException("库存服务不可用");
            if (confirmedReservations.add(reservationId)) confirms.incrementAndGet();
            return new Reservation(reservationId, reservationId.substring(4), "CONFIRMED");
        }
    }
}

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
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
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
        org.junit.jupiter.api.Assertions.assertTrue(first.orderNo().endsWith(first.id().substring("ORDER-".length())));
        org.junit.jupiter.api.Assertions.assertTrue(first.reservationId().startsWith("RES-ORDER-"));
        Integer count = jdbc.queryForObject("select count(*) from trade_order", Integer.class);
        assertEquals(before + 1, count);
    }

    @Test
    void failedInventoryReservationKeepsDurableCreateIntent() {
        String key = "CREATE-RESERVE-FAIL-" + UUID.randomUUID();
        CreateOrderRequest request = new CreateOrderRequest("F1", List.of(new OrderLineRequest("SKU-1", 1)),
                "张三", "13800000000", "湖南省长沙市");
        inventory.failReserve.set(true);
        try {
            org.junit.jupiter.api.Assertions.assertThrows(IllegalStateException.class,
                    () -> orderService.create(key, request));
        } finally {
            inventory.failReserve.set(false);
        }
        String orderId = jdbc.queryForObject("select order_id from trade_order_request where idempotency_key=?", String.class, key);
        assertEquals("CREATING", jdbc.queryForObject("select status from trade_order where id=?", String.class, orderId));
        org.junit.jupiter.api.Assertions.assertFalse(orderService.list("F1", 1, 200).items().stream()
                .anyMatch(order -> order.id().equals(orderId)));
        OrderView recovered = orderService.create(key, request);
        assertEquals(orderId, recovered.id());
        assertEquals("PENDING_PAYMENT", recovered.status());
        assertEquals(true, inventory.reservedOrders.contains(orderId));
        assertEquals(2, inventory.reserveAttempts.get(orderId).get());
    }

    @Test
    void scheduledCreationRecoversAfterInventoryServiceReturns() {
        String key = "CREATE-SCHEDULE-" + UUID.randomUUID();
        CreateOrderRequest request = new CreateOrderRequest("F1", List.of(new OrderLineRequest("SKU-1", 1)),
                "张三", "13800000000", "湖南省长沙市");
        inventory.failReserve.set(true);
        try {
            org.junit.jupiter.api.Assertions.assertThrows(IllegalStateException.class,
                    () -> orderService.create(key, request));
        } finally {
            inventory.failReserve.set(false);
        }
        String orderId = jdbc.queryForObject("select order_id from trade_order_request where idempotency_key=?", String.class, key);
        orderService.retryPendingCreations();
        assertEquals("PENDING_PAYMENT", orderService.find(orderId).status());
        assertEquals(true, inventory.reservedOrders.contains(orderId));
        assertEquals(2, inventory.reserveAttempts.get(orderId).get());
    }

    @Test
    void reservationIsRetriedWithSamePayloadAfterOrderCommitFailure() {
        String key = "CREATE-COMMIT-FAIL-" + UUID.randomUUID();
        CreateOrderRequest request = new CreateOrderRequest("F1", List.of(new OrderLineRequest("SKU-1", 1)),
                "张三", "13800000000", "湖南省长沙市");
        inventory.failReserve.set(true);
        try {
            org.junit.jupiter.api.Assertions.assertThrows(IllegalStateException.class,
                    () -> orderService.create(key, request));
        } finally {
            inventory.failReserve.set(false);
        }
        String orderId = jdbc.queryForObject("select order_id from trade_order_request where idempotency_key=?", String.class, key);
        inventory.onReserve = reservedOrderId -> {
            assertEquals(true, TransactionSynchronizationManager.isActualTransactionActive());
            assertEquals("CREATING", jdbc.queryForObject("select status from trade_order where id=?", String.class, reservedOrderId));
            assertEquals(1, jdbc.queryForObject("select count(*) from trade_order_item where order_id=?", Integer.class, reservedOrderId));
        };
        jdbc.execute("alter table trade_order add constraint ck_order_create_block_test check (id <> '"
                + orderId + "' or status <> 'PENDING_PAYMENT')");
        try {
            org.junit.jupiter.api.Assertions.assertThrows(DataAccessException.class,
                    () -> orderService.create(key, request));
            assertEquals("CREATING", orderService.find(orderId).status());
            assertEquals(true, inventory.reservedOrders.contains(orderId));
        } finally {
            inventory.onReserve = ignored -> {};
            jdbc.execute("alter table trade_order drop constraint ck_order_create_block_test");
        }
        orderService.retryPendingCreations();
        assertEquals("PENDING_PAYMENT", orderService.find(orderId).status());
        assertEquals(3, inventory.reserveAttempts.get(orderId).get());
        assertEquals(1, jdbc.queryForObject("select count(*) from sys_outbox_event where aggregate_id=? and event_type='order.created'",
                Integer.class, orderId));
    }

    @Test
    void changedPayloadConflictsWithPendingCreation() {
        String key = "CREATE-PENDING-CONFLICT-" + UUID.randomUUID();
        CreateOrderRequest request = new CreateOrderRequest("F1", List.of(new OrderLineRequest("SKU-1", 1)),
                "张三", "13800000000", "湖南省长沙市");
        inventory.failReserve.set(true);
        try {
            org.junit.jupiter.api.Assertions.assertThrows(IllegalStateException.class,
                    () -> orderService.create(key, request));
        } finally {
            inventory.failReserve.set(false);
        }
        org.junit.jupiter.api.Assertions.assertThrows(com.agritainmen.common.core.BusinessException.class,
                () -> orderService.create(key, new CreateOrderRequest("F1", List.of(new OrderLineRequest("SKU-1", 2)),
                        "张三", "13800000000", "湖南省长沙市")));
        String orderId = jdbc.queryForObject("select order_id from trade_order_request where idempotency_key=?", String.class, key);
        assertEquals(false, inventory.reservedOrders.contains(orderId));
    }

    @Test
    void outOfStockDoesNotCreateOrderAfterStockReturns() {
        String key = "CREATE-OUT-OF-STOCK-" + UUID.randomUUID();
        CreateOrderRequest request = new CreateOrderRequest("F1", List.of(new OrderLineRequest("SKU-1", 1)),
                "张三", "13800000000", "湖南省长沙市");
        inventory.outOfStock.set(true);
        try {
            var failure = org.junit.jupiter.api.Assertions.assertThrows(com.agritainmen.common.core.BusinessException.class,
                    () -> orderService.create(key, request));
            assertEquals(com.agritainmen.common.core.ErrorCode.OUT_OF_STOCK, failure.errorCode());
        } finally {
            inventory.outOfStock.set(false);
        }
        String orderId = jdbc.queryForObject("select order_id from trade_order_request where idempotency_key=?", String.class, key);
        assertEquals("CREATE_FAILED", orderService.find(orderId).status());
        org.junit.jupiter.api.Assertions.assertFalse(orderService.list("F1", 1, 200).items().stream()
                .anyMatch(order -> order.id().equals(orderId)));
        orderService.retryPendingCreations();
        assertEquals("CREATE_FAILED", orderService.find(orderId).status());
        assertEquals(false, inventory.reservedOrders.contains(orderId));
        var replay = org.junit.jupiter.api.Assertions.assertThrows(com.agritainmen.common.core.BusinessException.class,
                () -> orderService.create(key, request));
        assertEquals(com.agritainmen.common.core.ErrorCode.OUT_OF_STOCK, replay.errorCode());
    }

    @Test
    void scheduledOutOfStockStopsFurtherCreationAttempts() {
        String key = "CREATE-SCHEDULE-STOCK-" + UUID.randomUUID();
        CreateOrderRequest request = new CreateOrderRequest("F1", List.of(new OrderLineRequest("SKU-1", 1)),
                "张三", "13800000000", "湖南省长沙市");
        inventory.failReserve.set(true);
        try {
            org.junit.jupiter.api.Assertions.assertThrows(IllegalStateException.class,
                    () -> orderService.create(key, request));
        } finally {
            inventory.failReserve.set(false);
        }
        String orderId = jdbc.queryForObject("select order_id from trade_order_request where idempotency_key=?", String.class, key);
        inventory.outOfStock.set(true);
        try {
            orderService.retryPendingCreations();
        } finally {
            inventory.outOfStock.set(false);
        }
        orderService.retryPendingCreations();
        assertEquals("CREATE_FAILED", orderService.find(orderId).status());
        assertEquals(2, inventory.reserveAttempts.get(orderId).get());
    }

    @Test
    void concurrentRetriesDoNotReserveAfterStockFailure() throws Exception {
        String key = "CREATE-CONCURRENT-STOCK-" + UUID.randomUUID();
        CreateOrderRequest request = new CreateOrderRequest("F1", List.of(new OrderLineRequest("SKU-1", 1)),
                "张三", "13800000000", "湖南省长沙市");
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch secondStarted = new CountDownLatch(1);
        CountDownLatch proceed = new CountDownLatch(1);
        inventory.outOfStock.set(true);
        inventory.onReserve = ignored -> {
            entered.countDown();
            try {
                if (!proceed.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("并发测试等待超时");
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException(exception);
            }
        };
        try {
            CompletableFuture<com.agritainmen.common.core.ErrorCode> first = CompletableFuture.supplyAsync(
                    () -> createErrorCode(key, request));
            org.junit.jupiter.api.Assertions.assertTrue(entered.await(5, TimeUnit.SECONDS));
            CompletableFuture<com.agritainmen.common.core.ErrorCode> second = CompletableFuture.supplyAsync(() -> {
                secondStarted.countDown();
                return createErrorCode(key, request);
            });
            org.junit.jupiter.api.Assertions.assertTrue(secondStarted.await(5, TimeUnit.SECONDS));
            proceed.countDown();
            assertEquals(com.agritainmen.common.core.ErrorCode.OUT_OF_STOCK, first.get(5, TimeUnit.SECONDS));
            assertEquals(com.agritainmen.common.core.ErrorCode.OUT_OF_STOCK, second.get(5, TimeUnit.SECONDS));
            String orderId = jdbc.queryForObject("select order_id from trade_order_request where idempotency_key=?", String.class, key);
            assertEquals("CREATE_FAILED", orderService.find(orderId).status());
            assertEquals(1, inventory.reserveAttempts.get(orderId).get());
            assertEquals(false, inventory.reservedOrders.contains(orderId));
        } finally {
            proceed.countDown();
            inventory.onReserve = ignored -> {};
            inventory.outOfStock.set(false);
        }
    }

    private com.agritainmen.common.core.ErrorCode createErrorCode(String key, CreateOrderRequest request) {
        try {
            orderService.create(key, request);
            return null;
        } catch (com.agritainmen.common.core.BusinessException exception) {
            return exception.errorCode();
        }
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
        final AtomicBoolean failReserve = new AtomicBoolean();
        final AtomicBoolean outOfStock = new AtomicBoolean();
        final AtomicInteger reserveCalls = new AtomicInteger();
        final Set<String> reservedOrders = ConcurrentHashMap.newKeySet();
        final Map<String, java.time.Instant> reserveExpiries = new ConcurrentHashMap<>();
        final Map<String, AtomicInteger> reserveAttempts = new ConcurrentHashMap<>();
        volatile Consumer<String> onReserve = ignored -> {};
        final AtomicInteger releases = new AtomicInteger();
        final AtomicBoolean failRelease = new AtomicBoolean();
        final Set<String> failIds = ConcurrentHashMap.newKeySet();
        final AtomicInteger confirms = new AtomicInteger();
        final AtomicBoolean failConfirm = new AtomicBoolean();
        final Set<String> confirmedReservations = ConcurrentHashMap.newKeySet();
        volatile Consumer<String> onRelease = ignored -> {};
        volatile Consumer<String> onConfirm = ignored -> {};
        @Override public Reservation reserve(String orderId, List<Line> lines, java.time.Instant expiresAt) {
            reserveAttempts.computeIfAbsent(orderId, ignored -> new AtomicInteger()).incrementAndGet();
            onReserve.accept(orderId);
            java.time.Instant previous = reserveExpiries.putIfAbsent(orderId, expiresAt);
            if (previous != null && !previous.equals(expiresAt)) throw new IllegalStateException("预占重试到期时间变化");
            if (failReserve.get()) throw new IllegalStateException("库存服务不可用");
            if (outOfStock.get()) throw new com.agritainmen.common.core.BusinessException(
                    com.agritainmen.common.core.ErrorCode.OUT_OF_STOCK);
            if (reservedOrders.add(orderId)) reserveCalls.incrementAndGet();
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

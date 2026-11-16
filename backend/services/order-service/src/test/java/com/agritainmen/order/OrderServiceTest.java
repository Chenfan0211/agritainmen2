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

import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

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
    void failedInventoryReleaseKeepsOrderPending() {
        String key = "CANCEL-FAIL-" + UUID.randomUUID();
        OrderView created = orderService.create(key, new CreateOrderRequest("F1", List.of(new OrderLineRequest("SKU-1", 1)),
                "张三", "13800000000", "湖南省长沙市"));
        inventory.failRelease.set(true);
        try {
            org.junit.jupiter.api.Assertions.assertThrows(IllegalStateException.class,
                    () -> orderService.cancelPending(created.id()));
            assertEquals("PENDING_PAYMENT", orderService.find(created.id()).status());
        } finally {
            inventory.failRelease.set(false);
        }
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
        @Override public Reservation reserve(String orderId, List<Line> lines, java.time.Instant expiresAt) {
            return new Reservation("RES-" + orderId, orderId, "RESERVED");
        }
        @Override public Reservation release(String reservationId) {
            if (failRelease.get()) throw new IllegalStateException("库存服务不可用");
            releases.incrementAndGet();
            return new Reservation(reservationId, reservationId.substring(4), "RELEASED");
        }
    }
}

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

import static org.junit.jupiter.api.Assertions.assertEquals;

@SpringBootTest(properties = "spring.profiles.active=test")
@Import(OrderServiceTest.FakeClients.class)
class OrderServiceTest {
    @Autowired
    private OrderService orderService;
    @Autowired
    private JdbcTemplate jdbc;

    @Test
    void createOrderUsesServerPriceAndReplaysIdempotencyKey() {
        CreateOrderRequest request = new CreateOrderRequest("U1", List.of(new OrderLineRequest("SKU-1", 2)),
                "张三", "13800000000", "湖南省长沙市");
        OrderView first = orderService.create("ORDER-IDEM-1", request);
        OrderView second = orderService.create("ORDER-IDEM-1", request);
        assertEquals(first.id(), second.id());
        assertEquals(11980L, first.amountCents());
        assertEquals("PENDING_PAYMENT", first.status());
        org.junit.jupiter.api.Assertions.assertTrue(first.reservationId().startsWith("RES-ORDER-"));
        Integer count = jdbc.queryForObject("select count(*) from trade_order", Integer.class);
        assertEquals(1, count);
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
        InventoryClient inventoryClient() {
            return (orderId, lines, expiresAt) -> new InventoryClient.Reservation("RES-" + orderId, orderId, "RESERVED");
        }
    }
}

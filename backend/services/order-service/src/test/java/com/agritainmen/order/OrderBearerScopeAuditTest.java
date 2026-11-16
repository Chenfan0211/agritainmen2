package com.agritainmen.order;

import com.agritainmen.order.client.CatalogClient;
import com.agritainmen.order.client.InventoryClient;
import com.agritainmen.order.web.OrderDtos.PriceQuote;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.ArrayList;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

@Tag("api-audit")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"spring.profiles.active=test", "agritainmen.security.order-source.enabled=true",
                "agritainmen.security.payment.internal-token=test-payment-token"})
@Import(OrderBearerScopeAuditTest.FakeClients.class)
class OrderBearerScopeAuditTest {
    private static final HttpServer AUTH = authServer();
    @Value("${local.server.port}") int port;
    @Autowired JdbcTemplate jdbc;
    RestClient client;

    @DynamicPropertySource
    static void authUrl(DynamicPropertyRegistry registry) {
        registry.add("agritainmen.clients.auth.base-url", () -> "http://127.0.0.1:" + AUTH.getAddress().getPort());
    }

    @BeforeEach void setUp() { client = RestClient.builder().baseUrl("http://127.0.0.1:" + port).build(); }

    @Test void bearerUserCanCreateOnlyOwnOrder() {
        String id = "ORDER-" + UUID.randomUUID();
        assertEquals(401, status(null, "U-A", id));
        assertEquals(403, status("Bearer user-a", "U-B", id));
        assertEquals(200, status("Bearer user-a", "U-A", id));
    }

    @Test void storeTokenWithoutFarmBindingCannotClaimABuyer() {
        assertEquals(403, status("Bearer store-unbound", "F001", "ORDER-" + UUID.randomUUID()));
    }

    @Test void boundStoreCanOnlyCreateAndReadItsOwnFarmOrders() {
        assertEquals(403, status("Bearer store-a", "F002", "ORDER-" + UUID.randomUUID()));
        String own = create("Bearer store-a", "F001");
        String other = create("Bearer store-b", "F002");
        JsonNode list = client.get().uri("/api/v1/orders?buyerId=F002")
                .header("Authorization", "Bearer store-a").retrieve().body(JsonNode.class);
        List<String> ids = new ArrayList<>();
        for (JsonNode item : list.path("data").path("items")) {
            assertEquals("F001", item.path("buyerId").asText());
            ids.add(item.path("id").asText());
        }
        assertTrue(ids.contains(own));
        assertFalse(ids.contains(other));
        int detailStatus = client.get().uri("/api/v1/orders/" + other)
                .header("Authorization", "Bearer store-a")
                .exchange((request, response) -> response.getStatusCode().value());
        assertEquals(404, detailStatus);
    }

    @Test void anonymousCannotProbeWhetherAnOrderExists() {
        int status = client.get().uri("/api/v1/orders/MISSING-" + UUID.randomUUID())
                .exchange((request, response) -> response.getStatusCode().value());
        assertEquals(401, status);
    }

    @Test void internalCreationStatesAreNotVisibleToBuyer() {
        String creating = create("Bearer user-a", "U-A");
        String failed = create("Bearer user-a", "U-A");
        jdbc.update("update trade_order set status='CREATING' where id=?", creating);
        jdbc.update("update trade_order set status='CREATE_FAILED' where id=?", failed);
        for (String id : List.of(creating, failed)) {
            int detailStatus = client.get().uri("/api/v1/orders/" + id)
                    .header("Authorization", "Bearer user-a")
                    .exchange((request, response) -> response.getStatusCode().value());
            assertEquals(404, detailStatus);
        }
        JsonNode list = client.get().uri("/api/v1/orders?buyerId=U-A&pageSize=200")
                .header("Authorization", "Bearer user-a").retrieve().body(JsonNode.class);
        for (JsonNode item : list.path("data").path("items")) {
            assertFalse(creating.equals(item.path("id").asText()));
            assertFalse(failed.equals(item.path("id").asText()));
        }
    }

    @Test void buyerCannotExpandListOrReadAnotherBuyersOrder() {
        String own = create("Bearer user-a", "U-A");
        String other = create("Bearer user-b", "U-B");
        JsonNode list = client.get().uri("/api/v1/orders?buyerId=U-B")
                .header("Authorization", "Bearer user-a").retrieve().body(JsonNode.class);
        List<String> ids = new ArrayList<>();
        for (JsonNode item : list.path("data").path("items")) {
            assertEquals("U-A", item.path("buyerId").asText());
            ids.add(item.path("id").asText());
        }
        assertTrue(ids.contains(own));
        assertFalse(ids.contains(other));
        int detailStatus = client.get().uri("/api/v1/orders/" + other)
                .header("Authorization", "Bearer user-a")
                .exchange((request, response) -> response.getStatusCode().value());
        assertEquals(404, detailStatus);
    }

    @Test void cancellationRequiresCurrentBuyerAndPendingStatus() {
        String own = create("Bearer store-a", "F001");
        String other = create("Bearer store-b", "F002");
        assertEquals(401, cancel(null, own));
        assertEquals(404, cancel("Bearer store-a", other));
        assertEquals(404, cancel("Bearer user-a", own));
        assertEquals(200, cancel("Bearer store-a", own));
        assertEquals(200, cancel("Bearer store-a", own));
        assertEquals("UNPAID_CANCELLED", client.get().uri("/api/v1/orders/" + own)
                .header("Authorization", "Bearer store-a").retrieve().body(JsonNode.class)
                .path("data").path("status").asText());
    }

    @Test void paymentConfirmationRequiresInternalToken() {
        String own = create("Bearer store-a", "F001");
        assertEquals(401, paymentConfirm(own, null));
        assertEquals(401, paymentConfirm(own, "wrong-token"));
        assertEquals(200, paymentConfirm(own, "test-payment-token"));
        assertEquals("PAID", client.get().uri("/api/v1/orders/" + own)
                .header("Authorization", "Bearer store-a").retrieve().body(JsonNode.class)
                .path("data").path("status").asText());
    }

    private int paymentConfirm(String id, String token) {
        var request = client.post().uri("/api/v1/orders/" + id + "/payment-confirmation")
                .contentType(MediaType.APPLICATION_JSON).body(Map.of("amountCents", 100));
        if (token != null) request.header("X-Order-Payment-Token", token);
        return request.exchange((sent, response) -> response.getStatusCode().value());
    }

    private int cancel(String token, String id) {
        var request = client.post().uri("/api/v1/orders/" + id + "/cancel");
        if (token != null) request.header("Authorization", token);
        return request.exchange((sent, response) -> response.getStatusCode().value());
    }

    private int status(String token, String buyerId, String key) {
        var request = client.post().uri("/api/v1/orders").contentType(MediaType.APPLICATION_JSON)
                .header("Idempotency-Key", key);
        if (token != null) request.header("Authorization", token);
        return request.body(body(buyerId)).exchange((sent, response) -> response.getStatusCode().value());
    }

    private String create(String token, String buyerId) {
        return client.post().uri("/api/v1/orders").contentType(MediaType.APPLICATION_JSON)
                .header("Authorization", token).header("Idempotency-Key", "ORDER-" + UUID.randomUUID())
                .body(body(buyerId)).retrieve().body(JsonNode.class).path("data").path("id").asText();
    }

    private Map<String, Object> body(String buyerId) {
        return Map.of("buyerId", buyerId, "items", List.of(Map.of("skuId", "SKU-A", "quantity", 1)),
                "receiver", "张三", "receiverPhone", "13800000000", "address", "长沙市");
    }

    private static HttpServer authServer() {
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/api/v1/auth/me", exchange -> {
                String token = exchange.getRequestHeaders().getFirst("Authorization");
                String actor = "Bearer user-a".equals(token) ? "U-A" : "Bearer user-b".equals(token) ? "U-B"
                        : "Bearer store-unbound".equals(token) ? "SA-1"
                        : "Bearer store-a".equals(token) ? "SA-A"
                        : "Bearer store-b".equals(token) ? "SA-B" : null;
                int status = actor == null ? 401 : 200;
                String body = actor == null ? "{\"code\":\"UNAUTHORIZED\"}" :
                        "{\"code\":\"OK\",\"data\":{\"actorType\":\"" + (actor.startsWith("SA-") ? "store" : "user")
                                + "\",\"actorId\":\"" + actor + "\",\"tenantId\":\"PLATFORM\""
                                + ("SA-A".equals(actor) ? ",\"farmId\":\"F001\"" : "SA-B".equals(actor) ? ",\"farmId\":\"F002\"" : "") + "}}";
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(status, bytes.length);
                try (var out = exchange.getResponseBody()) { out.write(bytes); }
            });
            server.start();
            return server;
        } catch (Exception error) { throw new IllegalStateException(error); }
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class FakeClients {
        @Bean @Primary CatalogClient catalogClient() {
            return sku -> new PriceQuote(sku, "P-A", "S-A", "商品", 100L);
        }
        @Bean @Primary InventoryClient inventoryClient() {
            return new InventoryClient() {
                @Override public Reservation reserve(String orderId, List<Line> lines, java.time.Instant expiresAt) {
                    return new Reservation("R-" + orderId, orderId, "RESERVED");
                }
                @Override public Reservation release(String reservationId) {
                    return new Reservation(reservationId, reservationId.substring(2), "RELEASED");
                }
                @Override public Reservation confirm(String reservationId) {
                    return new Reservation(reservationId, reservationId.substring(2), "CONFIRMED");
                }
            };
        }
    }
}

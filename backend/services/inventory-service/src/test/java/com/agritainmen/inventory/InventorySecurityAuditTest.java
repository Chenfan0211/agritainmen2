package com.agritainmen.inventory;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.web.client.RestClient;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;

@Tag("api-audit")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"spring.profiles.active=test", "agritainmen.security.inventory.internal-token=test-inventory-token"})
class InventorySecurityAuditTest {
    private static final HttpServer AUTH = authServer();
    @Value("${local.server.port}") int port;
    @Autowired JdbcTemplate jdbc;
    private RestClient client;
    private String skuId;

    @DynamicPropertySource
    static void authUrl(DynamicPropertyRegistry registry) {
        registry.add("agritainmen.clients.auth.base-url", () -> "http://127.0.0.1:" + AUTH.getAddress().getPort());
    }

    @BeforeEach void setUp() {
        client = RestClient.builder().baseUrl("http://127.0.0.1:" + port).build();
        skuId = "SKU-SEC-" + UUID.randomUUID();
        jdbc.update("""
                insert into inventory_stock(id,tenant_id,sku_id,available_qty,reserved_qty,created_at,updated_at,version,deleted)
                values (?, 'PLATFORM', ?, 10, 0, current_timestamp, current_timestamp, 0, false)
                """, "STOCK-" + UUID.randomUUID(), skuId);
    }

    @Test void availableStockCanBeReadWithoutSpringBasicCredentials() {
        int status = client.get().uri("/api/v1/inventory/skus/{skuId}/available", skuId)
                .exchange((request, response) -> response.getStatusCode().value());
        assertEquals(200, status);
    }

    @Test void onlyOrderInternalTokenCanReserveAndRelease() {
        String orderId = "ORDER-SEC-" + UUID.randomUUID();
        assertEquals(401, reserve(orderId, null));
        assertEquals(401, reserve(orderId, "wrong-token"));
        assertEquals(10, available());
        assertEquals(200, reserve(orderId, "test-inventory-token"));
        String reservationId = jdbc.queryForObject("select id from inventory_reservation where order_id=?", String.class, orderId);
        assertEquals(9, available());
        assertEquals(401, release(reservationId, null));
        assertEquals(9, available());
        assertEquals(200, release(reservationId, "test-inventory-token"));
        assertEquals(10, available());

        String secondOrder = "ORDER-SEC-" + UUID.randomUUID();
        assertEquals(200, reserve(secondOrder, "test-inventory-token"));
        String secondReservation = jdbc.queryForObject("select id from inventory_reservation where order_id=?", String.class, secondOrder);
        assertEquals(401, confirm(secondReservation, null));
        assertEquals(401, confirm(secondReservation, "wrong-token"));
        assertEquals(200, confirm(secondReservation, "test-inventory-token"));
        assertEquals(9, available());
    }

    @Test void stockAdjustmentRequiresCurrentPlatformAdmin() {
        assertEquals(401, adjust(null));
        assertEquals(403, adjust("Bearer user-ok"));
        assertEquals(401, adjust("Bearer revoked"));
        assertEquals(10, available());
        assertEquals(200, adjust("Bearer admin-ok"));
        assertEquals(11, available());
    }

    private int available() {
        return client.get().uri("/api/v1/inventory/skus/{skuId}/available", skuId)
                .retrieve().body(tools.jackson.databind.JsonNode.class).path("data").asInt();
    }

    private int reserve(String orderId, String token) {
        var request = client.post().uri("/api/v1/inventory/reservations")
                .contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", orderId)
                .body(Map.of("orderId", orderId, "items", List.of(Map.of("skuId", skuId, "quantity", 1)),
                        "expiresAt", Instant.now().plusSeconds(1800).toString()));
        if (token != null) request.header("X-Inventory-Internal-Token", token);
        return request.exchange((sent, response) -> response.getStatusCode().value());
    }

    private int release(String reservationId, String token) {
        var request = client.post().uri("/api/v1/inventory/reservations/{id}/release", reservationId);
        if (token != null) request.header("X-Inventory-Internal-Token", token);
        return request.exchange((sent, response) -> response.getStatusCode().value());
    }

    private int confirm(String reservationId, String token) {
        var request = client.post().uri("/api/v1/inventory/reservations/{id}/confirm", reservationId);
        if (token != null) request.header("X-Inventory-Internal-Token", token);
        return request.exchange((sent, response) -> response.getStatusCode().value());
    }

    private int adjust(String authorization) {
        var request = client.post().uri("/api/v1/inventory/skus/{id}/adjust", skuId)
                .contentType(MediaType.APPLICATION_JSON).body(Map.of("delta", 1, "reason", "security-audit"));
        if (authorization != null) request.header("Authorization", authorization);
        return request.exchange((sent, response) -> response.getStatusCode().value());
    }

    private static HttpServer authServer() {
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/api/v1/auth/me", exchange -> {
                String token = exchange.getRequestHeaders().getFirst("Authorization");
                int status = "Bearer admin-ok".equals(token) || "Bearer user-ok".equals(token) ? 200 : 401;
                String actor = "Bearer admin-ok".equals(token) ? "admin" : "user";
                String body = status == 200
                        ? "{\"code\":\"OK\",\"data\":{\"actorType\":\"" + actor
                        + "\",\"actorId\":\"A1\",\"tenantId\":\"PLATFORM\"}}"
                        : "{\"code\":\"UNAUTHORIZED\"}";
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(status, bytes.length);
                try (var output = exchange.getResponseBody()) { output.write(bytes); }
            });
            server.start();
            return server;
        } catch (Exception exception) { throw new IllegalStateException(exception); }
    }
}

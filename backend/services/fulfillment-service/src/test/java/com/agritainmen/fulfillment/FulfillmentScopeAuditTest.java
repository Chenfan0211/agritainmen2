package com.agritainmen.fulfillment;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.databind.JsonNode;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

@Tag("api-audit")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = "spring.profiles.active=test")
@Import(FulfillmentScopeAuditTest.PermitAll.class)
class FulfillmentScopeAuditTest {
    @TestConfiguration(proxyBeanMethods = false)
    static class PermitAll {
        @Bean SecurityFilterChain filter(HttpSecurity http) throws Exception {
            return http.csrf(csrf -> csrf.disable()).authorizeHttpRequests(auth -> auth.anyRequest().permitAll()).build();
        }
    }
    static final HttpServer auth = startAuth();
    @DynamicPropertySource
    static void authUrl(DynamicPropertyRegistry registry) {
        registry.add("agritainmen.clients.auth.base-url", () -> "http://127.0.0.1:" + auth.getAddress().getPort());
    }
    static HttpServer startAuth() {
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/api/v1/auth/me", exchange -> {
                String token = exchange.getRequestHeaders().getFirst("Authorization");
                String actor = "Bearer admin".equals(token) ? "admin" : "Bearer d1".equals(token) ? "driver" : "supplier";
                String supplierId = "Bearer s1".equals(token) || "Bearer d1".equals(token) ? "S1" : "Bearer s2".equals(token) ? "S2" : null;
                int status = supplierId == null && !"admin".equals(actor) ? 401 : 200;
                String body = status == 401 ? "{\"code\":\"UNAUTHORIZED\",\"data\":null}"
                        : "{\"code\":\"OK\",\"data\":{\"actorType\":\"" + actor + "\",\"tenantId\":\"PLATFORM\",\"supplierId\":"
                        + (supplierId == null ? "null" : "\"" + supplierId + "\"")
                        + ",\"driverId\":" + ("driver".equals(actor) ? "\"D1\"" : "null") + "}}";
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(status, bytes.length);
                try (var out = exchange.getResponseBody()) { out.write(bytes); }
            });
            server.createContext("/api/v1/auth/supplier/drivers", exchange -> {
                String token = exchange.getRequestHeaders().getFirst("Authorization");
                String body = "Bearer s1".equals(token)
                        ? "{\"code\":\"OK\",\"data\":[{\"id\":\"D1\",\"enabled\":true},{\"id\":\"D-DISABLED\",\"enabled\":false}]}"
                        : "{\"code\":\"OK\",\"data\":[{\"id\":\"D2\",\"enabled\":true}]}";
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, bytes.length);
                try (var out = exchange.getResponseBody()) { out.write(bytes); }
            });
            server.start();
            return server;
        } catch (java.io.IOException error) { throw new IllegalStateException(error); }
    }

    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    RestClient client;

    @BeforeEach void setUp() {
        client = RestClient.builder().baseUrl("http://127.0.0.1:" + port).build();
        jdbc.update("delete from fulfillment_order");
        for (String id : new String[]{"S1", "S2"}) jdbc.update("insert into fulfillment_order(id,tenant_id,order_id,supplier_id,status,created_at,updated_at,version,deleted) values (?, 'PLATFORM', ?, ?, 'PENDING', current_timestamp, current_timestamp, 0, false)", "F-" + id, "O-" + id, id);
    }

    @Test void supplierCannotExpandScopeOrMutateAnotherSupplier() {
        assertEquals(401, assertThrows(RestClientResponseException.class,
                () -> client.get().uri("/api/v1/fulfillment/orders").retrieve().body(JsonNode.class)).getStatusCode().value());
        JsonNode own = client.get().uri("/api/v1/fulfillment/orders?supplierId=S2")
                .header("Authorization", "Bearer s1").retrieve().body(JsonNode.class).path("data");
        assertEquals(1, own.path("total").asInt());
        assertEquals("S1", own.path("items").get(0).path("supplier_id").asText());
        assertEquals(404, assertThrows(RestClientResponseException.class,
                () -> client.post().uri("/api/v1/fulfillment/orders/F-S2/accept")
                        .header("Authorization", "Bearer s1").retrieve().body(JsonNode.class)).getStatusCode().value());
        assertEquals("PENDING", jdbc.queryForObject("select status from fulfillment_order where id='F-S2'", String.class));
        assertEquals("ACCEPTED", client.post().uri("/api/v1/fulfillment/orders/F-S1/accept")
                .header("Authorization", "Bearer s1").retrieve().body(JsonNode.class).path("data").path("status").asText());
    }

    @Test void onlyPlatformCanCreateOrderAndSupplierCannotReadOthersTracking() {
        assertEquals(403, assertThrows(RestClientResponseException.class,
                () -> client.post().uri("/api/v1/fulfillment/orders").header("Authorization", "Bearer s1")
                        .contentType(MediaType.APPLICATION_JSON).body(Map.of("orderId", "O3", "supplierId", "S2"))
                        .retrieve().body(JsonNode.class)).getStatusCode().value());
        JsonNode created = client.post().uri("/api/v1/fulfillment/orders").header("Authorization", "Bearer admin")
                .contentType(MediaType.APPLICATION_JSON).body(Map.of("orderId", "O3", "supplierId", "S2"))
                .retrieve().body(JsonNode.class);
        assertFalse(created.path("data").asText().isBlank());
    }

    @Test void driverSeesOnlyAssignedOrdersAndCannotAccept() {
        jdbc.update("update fulfillment_order set driver_id='D1',tracking_no='TRACK-1' where id='F-S1'");
        jdbc.update("insert into fulfillment_order(id,tenant_id,order_id,supplier_id,status,driver_id,tracking_no,created_at,updated_at,version,deleted) values ('F-OTHER-DRIVER','PLATFORM','O4','S1','SHIPPED','D2','TRACK-2',current_timestamp,current_timestamp,0,false)");
        JsonNode orders = client.get().uri("/api/v1/fulfillment/orders?supplierId=S2")
                .header("Authorization", "Bearer d1").retrieve().body(JsonNode.class).path("data");
        assertEquals(1, orders.path("total").asInt());
        assertEquals("F-S1", orders.path("items").get(0).path("id").asText());
        assertEquals(403, assertThrows(RestClientResponseException.class,
                () -> client.post().uri("/api/v1/fulfillment/orders/F-S1/accept")
                        .header("Authorization", "Bearer d1").retrieve().body(JsonNode.class)).getStatusCode().value());
        assertEquals(404, assertThrows(RestClientResponseException.class,
                () -> client.get().uri("/api/v1/fulfillment/logistics/TRACK-2")
                        .header("Authorization", "Bearer d1").retrieve().body(JsonNode.class)).getStatusCode().value());
    }

    @Test void driverShipmentRejectsOtherSupplierAndDisabledDriver() {
        client.post().uri("/api/v1/fulfillment/orders/F-S1/accept")
                .header("Authorization", "Bearer s1").retrieve().body(JsonNode.class);
        for (String driverId : new String[]{"D2", "D-DISABLED"}) {
            assertEquals(403, assertThrows(RestClientResponseException.class,
                    () -> client.post().uri("/api/v1/fulfillment/orders/F-S1/ship")
                            .header("Authorization", "Bearer s1")
                            .contentType(MediaType.APPLICATION_JSON).body(Map.of("shipType", "driver", "driverId", driverId))
                            .retrieve().body(JsonNode.class)).getStatusCode().value());
        }
        assertEquals("ACCEPTED", jdbc.queryForObject("select status from fulfillment_order where id='F-S1'", String.class));
        JsonNode shipped = client.post().uri("/api/v1/fulfillment/orders/F-S1/ship")
                .header("Authorization", "Bearer s1")
                .contentType(MediaType.APPLICATION_JSON).body(Map.of("shipType", "driver", "driverId", "D1"))
                .retrieve().body(JsonNode.class).path("data");
        assertEquals("D1", shipped.path("driver_id").asText());
    }

    @Test void courierShipmentDoesNotAssignDriver() {
        client.post().uri("/api/v1/fulfillment/orders/F-S1/accept")
                .header("Authorization", "Bearer s1").retrieve().body(JsonNode.class);
        JsonNode shipped = client.post().uri("/api/v1/fulfillment/orders/F-S1/ship")
                .header("Authorization", "Bearer s1")
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("shipType", "courier", "trackingNo", "TRACK-COURIER", "driverId", "D2"))
                .retrieve().body(JsonNode.class).path("data");
        assertTrue(shipped.path("driver_id").isNull());
    }
}

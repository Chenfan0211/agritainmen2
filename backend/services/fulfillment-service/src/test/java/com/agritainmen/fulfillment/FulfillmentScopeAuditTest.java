package com.agritainmen.fulfillment;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.databind.JsonNode;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

@Tag("api-audit")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = "spring.profiles.active=test")
class FulfillmentScopeAuditTest {
    static final HttpServer auth = startAuth();
    @DynamicPropertySource
    static void authUrl(DynamicPropertyRegistry registry) {
        registry.add("agritainmen.clients.auth.base-url", () -> "http://127.0.0.1:" + auth.getAddress().getPort());
        registry.add("agritainmen.clients.order.base-url", () -> "http://127.0.0.1:" + auth.getAddress().getPort());
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
                        ? "{\"code\":\"OK\",\"data\":[{\"id\":\"D1\",\"enabled\":true},{\"id\":\"D3\",\"enabled\":true},{\"id\":\"D-DISABLED\",\"enabled\":false}]}"
                        : "{\"code\":\"OK\",\"data\":[{\"id\":\"D2\",\"enabled\":true}]}";
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, bytes.length);
                try (var out = exchange.getResponseBody()) { out.write(bytes); }
            });
            server.createContext("/api/v1/orders/", exchange -> {
                assertTrue(exchange.getRequestURI().getPath().endsWith("/fulfillment-source"));
                String path = exchange.getRequestURI().getPath();
                boolean mixed = path.equals("/api/v1/orders/O-MIX/fulfillment-source");
                boolean found = mixed || path.equals("/api/v1/orders/O3/fulfillment-source");
                String body = found ? "{\"code\":\"OK\",\"data\":{\"id\":\"" + (mixed ? "O-MIX" : "O3") + "\",\"buyerId\":\"F1\","
                        + "\"receiver\":\"店长\",\"receiverPhone\":\"13800000000\",\"address\":\"长沙市\","
                        + "\"items\":[{\"supplierId\":\"S2\"}" + (mixed ? ",{\"supplierId\":\"S1\"}" : "") + "]}}"
                        : "{\"code\":\"NOT_FOUND\",\"data\":null}";
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(found ? 200 : 404, bytes.length);
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

    @Test void unrelatedServicePathsRemainClosed() {
        int status = client.get().uri("/v3/api-docs")
                .exchange((request, response) -> response.getStatusCode().value());
        assertEquals(403, status);
    }

    @Test void batchAcceptanceIsScopedAndAtomic() {
        jdbc.update("insert into fulfillment_order(id,tenant_id,order_id,supplier_id,status,created_at,updated_at,version,deleted) values ('F-S1-B','PLATFORM','O-S1-B','S1','PENDING',current_timestamp,current_timestamp,0,false)");
        assertEquals(401, assertThrows(RestClientResponseException.class,
                () -> batch(null, List.of("F-S1", "F-S1-B"))).getStatusCode().value());
        assertEquals(403, assertThrows(RestClientResponseException.class,
                () -> batch("Bearer d1", List.of("F-S1", "F-S1-B"))).getStatusCode().value());
        assertEquals(404, assertThrows(RestClientResponseException.class,
                () -> batch("Bearer s1", List.of("F-S1", "F-S2"))).getStatusCode().value());
        assertEquals("PENDING", jdbc.queryForObject("select status from fulfillment_order where id='F-S1'", String.class));
        assertEquals(400, assertThrows(RestClientResponseException.class,
                () -> batch("Bearer s1", List.of("F-S1", "F-S1"))).getStatusCode().value());
        assertEquals(400, assertThrows(RestClientResponseException.class,
                () -> batch("Bearer s1", List.of())).getStatusCode().value());
        jdbc.update("update fulfillment_order set status='ACCEPTED' where id='F-S1-B'");
        assertEquals(409, assertThrows(RestClientResponseException.class,
                () -> batch("Bearer s1", List.of("F-S1", "F-S1-B"))).getStatusCode().value());
        assertEquals("PENDING", jdbc.queryForObject("select status from fulfillment_order where id='F-S1'", String.class));
        jdbc.update("update fulfillment_order set status='PENDING' where id='F-S1-B'");
        assertEquals(2, batch("Bearer s1", List.of("F-S1", "F-S1-B")).path("data").path("accepted").asInt());
        assertEquals(2, jdbc.queryForObject("select count(*) from fulfillment_order where supplier_id='S1' and status='ACCEPTED'", Integer.class));
        assertEquals(409, assertThrows(RestClientResponseException.class,
                () -> batch("Bearer s1", List.of("F-S1", "F-S1-B"))).getStatusCode().value());
    }

    private JsonNode batch(String token, List<String> ids) {
        var request = client.post().uri("/api/v1/fulfillment/orders/batch-accept").contentType(MediaType.APPLICATION_JSON);
        if (token != null) request.header("Authorization", token);
        return request.body(Map.of("ids", ids)).retrieve().body(JsonNode.class);
    }

    @Test void onlyPlatformCanCreateOrderAndSupplierCannotReadOthersTracking() {
        assertEquals(403, assertThrows(RestClientResponseException.class,
                () -> client.post().uri("/api/v1/fulfillment/orders").header("Authorization", "Bearer s1")
                        .contentType(MediaType.APPLICATION_JSON).body(Map.of("orderId", "O3", "supplierId", "S2"))
                        .retrieve().body(JsonNode.class)).getStatusCode().value());
        assertEquals(403, assertThrows(RestClientResponseException.class,
                () -> client.post().uri("/api/v1/fulfillment/orders").header("Authorization", "Bearer admin")
                        .contentType(MediaType.APPLICATION_JSON).body(Map.of("orderId", "O3", "supplierId", "S1"))
                        .retrieve().body(JsonNode.class)).getStatusCode().value());
        JsonNode created = client.post().uri("/api/v1/fulfillment/orders").header("Authorization", "Bearer admin")
                .contentType(MediaType.APPLICATION_JSON).body(Map.of("orderId", "O3", "supplierId", "S2"))
                .retrieve().body(JsonNode.class);
        assertFalse(created.path("data").asText().isBlank());
        assertEquals(404, assertThrows(RestClientResponseException.class,
                () -> client.post().uri("/api/v1/fulfillment/orders").header("Authorization", "Bearer admin")
                        .contentType(MediaType.APPLICATION_JSON).body(Map.of("orderId", "MISSING", "supplierId", "S2"))
                        .retrieve().body(JsonNode.class)).getStatusCode().value());
        assertEquals(0, jdbc.queryForObject("select count(*) from fulfillment_order where order_id='MISSING'", Integer.class));
    }

    @Test void suppliersSeeSeparateFulfillmentsForOneMixedOrder() {
        String first = createFor("O-MIX", "S1");
        String second = createFor("O-MIX", "S2");
        assertNotEquals(first, second);
        assertEquals(first, createFor("O-MIX", "S1"));
        for (String supplier : List.of("S1", "S2")) {
            String token = supplier.equals("S1") ? "Bearer s1" : "Bearer s2";
            String ownId = supplier.equals("S1") ? first : second;
            String otherId = supplier.equals("S1") ? second : first;
            JsonNode items = client.get().uri("/api/v1/fulfillment/orders").header("Authorization", token)
                    .retrieve().body(JsonNode.class).path("data").path("items");
            int mixedCount = 0;
            for (JsonNode item : items) {
                if ("O-MIX".equals(item.path("order_id").asText())) {
                    mixedCount++;
                    assertEquals(ownId, item.path("id").asText());
                }
            }
            assertEquals(1, mixedCount);
            assertEquals(404, assertThrows(RestClientResponseException.class,
                    () -> client.post().uri("/api/v1/fulfillment/orders/" + otherId + "/accept")
                            .header("Authorization", token).retrieve().body(JsonNode.class)).getStatusCode().value());
        }
    }

    private String createFor(String orderId, String supplierId) {
        return client.post().uri("/api/v1/fulfillment/orders").header("Authorization", "Bearer admin")
                .contentType(MediaType.APPLICATION_JSON).body(Map.of("orderId", orderId, "supplierId", supplierId))
                .retrieve().body(JsonNode.class).path("data").asText();
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
        assign("Bearer s1", "D1", null);
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

    @Test void supplierAssignsOnlyOwnActiveDriverAndShipmentUsesCurrentAssignment() {
        client.post().uri("/api/v1/fulfillment/orders/F-S1/accept")
                .header("Authorization", "Bearer s1").retrieve().body(JsonNode.class);
        assertEquals(404, assertThrows(RestClientResponseException.class,
                () -> assign("Bearer s2", "D2", null)).getStatusCode().value());
        assertEquals(403, assertThrows(RestClientResponseException.class,
                () -> assign("Bearer d1", "D1", null)).getStatusCode().value());
        assertEquals(403, assertThrows(RestClientResponseException.class,
                () -> assign("Bearer s1", "D2", null)).getStatusCode().value());
        assertEquals(403, assertThrows(RestClientResponseException.class,
                () -> assign("Bearer s1", "D-DISABLED", null)).getStatusCode().value());
        assertEquals("D1", assign("Bearer s1", "D1", null).path("data").path("driver_id").asText());
        assertEquals(1, client.get().uri("/api/v1/fulfillment/orders")
                .header("Authorization", "Bearer d1").retrieve().body(JsonNode.class).path("data").path("total").asInt());
        assertEquals(409, assertThrows(RestClientResponseException.class,
                () -> assign("Bearer s1", "D3", "wrong-driver")).getStatusCode().value());
        assertEquals("D3", assign("Bearer s1", "D3", "D1").path("data").path("driver_id").asText());
        assertEquals(409, assertThrows(RestClientResponseException.class,
                () -> client.post().uri("/api/v1/fulfillment/orders/F-S1/ship")
                        .header("Authorization", "Bearer s1").contentType(MediaType.APPLICATION_JSON)
                        .body(Map.of("shipType", "driver", "driverId", "D1"))
                        .retrieve().body(JsonNode.class)).getStatusCode().value());
        assertEquals("SHIPPED", client.post().uri("/api/v1/fulfillment/orders/F-S1/ship")
                .header("Authorization", "Bearer s1").contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("shipType", "driver", "driverId", "D3"))
                .retrieve().body(JsonNode.class).path("data").path("status").asText());
        assertEquals(409, assertThrows(RestClientResponseException.class,
                () -> assign("Bearer s1", "D1", "D3")).getStatusCode().value());
    }

    private JsonNode assign(String token, String driverId, String expectedDriverId) {
        Map<String, String> body = new java.util.HashMap<>();
        body.put("driverId", driverId);
        if (expectedDriverId != null) body.put("expectedDriverId", expectedDriverId);
        return client.post().uri("/api/v1/fulfillment/orders/F-S1/assign-driver")
                .header("Authorization", token).contentType(MediaType.APPLICATION_JSON)
                .body(body).retrieve().body(JsonNode.class);
    }
}

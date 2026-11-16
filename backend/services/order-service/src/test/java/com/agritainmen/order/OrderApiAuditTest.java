package com.agritainmen.order;

import com.agritainmen.order.client.CatalogClient;
import com.agritainmen.order.client.InventoryClient;
import com.agritainmen.order.web.OrderDtos.PriceQuote;
import com.agritainmen.order.web.OrderAccessVerifier;
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
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.client.RestClient;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@Tag("api-audit")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = "spring.profiles.active=test")
@Import({OrderApiAuditTest.FakeCrossServiceClients.class, OrderApiAuditTest.PermitAllApiAuditSecurity.class})
class OrderApiAuditTest {
    @MockitoBean
    private OrderAccessVerifier accessVerifier;
    @Value("${local.server.port}")
    private int port;

    @Autowired
    private JsonMapper jsonMapper;

    @Autowired
    private JdbcTemplate jdbc;

    private RestClient client;

    @BeforeEach
    void setUp() {
        client = RestClient.builder().baseUrl("http://127.0.0.1:" + port).build();
    }

    @Test
    void createAndQueryOrderReturnUnifiedEnvelope() {
        String idempotencyKey = unique("ORDER-CREATE");
        ResponseEntity<JsonNode> created = postOrder(idempotencyKey, orderBody("BUYER-CREATE", 2));

        JsonNode createdEnvelope = assertEnvelope(created, 200, "OK");
        JsonNode order = createdEnvelope.path("data");
        String orderId = order.path("id").asText();
        assertFalse(orderId.isBlank());
        assertEquals("PENDING_PAYMENT", order.path("status").asText());
        assertEquals(11980L, order.path("amountCents").asLong());
        assertEquals(2, order.path("items").get(0).path("quantity").asInt());

        ResponseEntity<JsonNode> queried = get("/api/v1/orders/" + orderId);
        JsonNode queriedOrder = assertEnvelope(queried, 200, "OK").path("data");
        assertEquals(orderId, queriedOrder.path("id").asText());
        assertEquals(order.path("orderNo").asText(), queriedOrder.path("orderNo").asText());
    }

    @Test
    void missingIdempotencyKeyReturnsBadRequestEnvelope() {
        ResponseEntity<JsonNode> response = post("/api/v1/orders", orderBody("BUYER-NO-KEY", 1), null);

        JsonNode envelope = assertEnvelope(response, 400, "BAD_REQUEST");
        assertTrue(envelope.path("data").isNull());
    }

    @Test
    void duplicateIdempotencyKeyWithSamePayloadReplaysOrder() {
        String idempotencyKey = unique("ORDER-REPLAY");
        Map<String, Object> request = orderBody("BUYER-REPLAY", 1);

        JsonNode first = assertEnvelope(postOrder(idempotencyKey, request), 200, "OK").path("data");
        JsonNode second = assertEnvelope(postOrder(idempotencyKey, request), 200, "OK").path("data");

        assertEquals(first.path("id").asText(), second.path("id").asText());
        assertEquals(1, jdbc.queryForObject(
                "select count(*) from trade_order_request where idempotency_key=?", Integer.class, idempotencyKey));
    }

    @Test
    void duplicateIdempotencyKeyWithChangedPayloadReturnsConflict() {
        String idempotencyKey = unique("ORDER-CONFLICT");
        assertEnvelope(postOrder(idempotencyKey, orderBody("BUYER-CONFLICT", 1)), 200, "OK");

        ResponseEntity<JsonNode> repeated = postOrder(idempotencyKey, orderBody("BUYER-CONFLICT", 2));

        JsonNode envelope = assertEnvelope(repeated, 409, "IDEMPOTENCY_CONFLICT");
        assertTrue(envelope.path("data").isNull());
    }

    @Test
    void missingOrderReturnsNotFoundEnvelope() {
        ResponseEntity<JsonNode> response = get("/api/v1/orders/" + unique("MISSING-ORDER"));

        JsonNode envelope = assertEnvelope(response, 404, "NOT_FOUND");
        assertTrue(envelope.path("data").isNull());
    }

    private ResponseEntity<JsonNode> postOrder(String idempotencyKey, Map<String, Object> request) {
        return post("/api/v1/orders", request, idempotencyKey);
    }

    private Map<String, Object> orderBody(String buyerId, int quantity) {
        return Map.of(
                "buyerId", buyerId,
                "items", List.of(Map.of("skuId", "SKU-AUDIT", "quantity", quantity)),
                "receiver", "审计收货人",
                "receiverPhone", "13800000000",
                "address", "湖南省长沙市审计路 1 号"
        );
    }

    private ResponseEntity<JsonNode> get(String path) {
        return exchange(client.get().uri(path));
    }

    private ResponseEntity<JsonNode> post(String path, Object body, String idempotencyKey) {
        RestClient.RequestBodySpec request = client.post().uri(path).contentType(MediaType.APPLICATION_JSON);
        if (idempotencyKey != null) {
            request.header("Idempotency-Key", idempotencyKey);
        }
        return exchange(request.body(body));
    }

    private ResponseEntity<JsonNode> exchange(RestClient.RequestHeadersSpec<?> request) {
        return request.exchange((sentRequest, response) -> {
            byte[] payload = response.getBody().readAllBytes();
            JsonNode body = payload.length == 0 ? null : jsonMapper.readTree(payload);
            return new ResponseEntity<>(body, response.getHeaders(), response.getStatusCode());
        });
    }

    private JsonNode assertEnvelope(ResponseEntity<JsonNode> response, int expectedStatus, String expectedCode) {
        assertEquals(expectedStatus, response.getStatusCode().value(), () -> "实际响应: " + response.getBody());
        JsonNode envelope = response.getBody();
        assertNotNull(envelope, "响应必须包含统一 envelope");
        assertEquals(expectedCode, envelope.path("code").asText());
        assertFalse(envelope.path("message").asText().isBlank());
        assertTrue(envelope.has("data"));
        assertFalse(envelope.path("traceId").asText().isBlank());
        assertEquals(envelope.path("traceId").asText(), response.getHeaders().getFirst("X-Trace-Id"));
        assertFalse(envelope.path("timestamp").asText().isBlank());
        return envelope;
    }

    private String unique(String prefix) {
        return prefix + "-" + UUID.randomUUID();
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class PermitAllApiAuditSecurity {
        @Bean
        SecurityFilterChain apiAuditFilterChain(HttpSecurity http) throws Exception {
            return http
                    .csrf(csrf -> csrf.disable())
                    .authorizeHttpRequests(auth -> auth.anyRequest().permitAll())
                    .build();
        }
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class FakeCrossServiceClients {
        @Bean
        @Primary
        CatalogClient catalogClient() {
            return skuId -> new PriceQuote(skuId, "PRODUCT-AUDIT", "SUPPLIER-AUDIT", "审计商品", 5990L);
        }

        @Bean
        @Primary
        InventoryClient inventoryClient() {
            return new InventoryClient() {
                @Override public Reservation reserve(String orderId, java.util.List<Line> lines, java.time.Instant expiresAt) {
                    return new Reservation("RES-" + orderId, orderId, "RESERVED");
                }
                @Override public Reservation release(String reservationId) {
                    return new Reservation(reservationId, reservationId.substring(4), "RELEASED");
                }
            };
        }
    }
}

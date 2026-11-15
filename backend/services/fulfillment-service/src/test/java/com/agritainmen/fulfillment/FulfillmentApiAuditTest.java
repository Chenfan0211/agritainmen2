package com.agritainmen.fulfillment;

import com.agritainmen.fulfillment.web.FulfillmentAccessVerifier;
import com.agritainmen.fulfillment.client.OrderSourceClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.client.RestClient;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;

@Tag("api-audit")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = "spring.profiles.active=test")
class FulfillmentApiAuditTest {
    @Value("${local.server.port}")
    private int port;

    @Autowired
    private JsonMapper jsonMapper;

    @Autowired
    private JdbcTemplate jdbc;
    @MockitoBean FulfillmentAccessVerifier accessVerifier;
    @MockitoBean OrderSourceClient orderSourceClient;

    private RestClient client;

    @BeforeEach
    void setUp() {
        client = RestClient.builder().baseUrl("http://127.0.0.1:" + port).build();
        when(accessVerifier.verify("Bearer admin")).thenReturn(new FulfillmentAccessVerifier.Identity("admin", "", ""));
        when(accessVerifier.verify("Bearer supplier")).thenReturn(new FulfillmentAccessVerifier.Identity("supplier", "SUPPLIER-AUDIT", ""));
        when(orderSourceClient.load(anyString(), eq("SUPPLIER-AUDIT"), eq("Bearer admin")))
                .thenReturn(new OrderSourceClient.Source("F-AUDIT", "收货人", "13800000000", "长沙市测试路 1 号"));
        when(orderSourceClient.load(anyString(), eq("OTHER"), eq("Bearer admin")))
                .thenReturn(new OrderSourceClient.Source("F-AUDIT", "收货人", "13800000000", "长沙市测试路 1 号"));
    }

    @Test
    void createFulfillmentReturnsIdInUnifiedEnvelope() {
        String orderId = unique("ORDER-CREATE");

        JsonNode fulfillmentId = assertEnvelope(create(orderId), 200, "OK").path("data");

        assertFalse(fulfillmentId.asText().isBlank());
        assertEquals(orderId, jdbc.queryForObject(
                "select order_id from fulfillment_order where id=?", String.class, fulfillmentId.asText()));
        Map<String, Object> snapshot = jdbc.queryForMap("select buyer_id, receiver, receiver_phone, address from fulfillment_order where id=?", fulfillmentId.asText());
        assertEquals("F-AUDIT", snapshot.get("buyer_id"));
        assertEquals("长沙市测试路 1 号", snapshot.get("address"));
        JsonNode listed = assertEnvelope(get("/api/v1/fulfillment/orders"), 200, "OK").path("data").path("items").get(0);
        assertEquals("F-AUDIT", listed.path("buyer_id").asText());
        assertEquals("长沙市测试路 1 号", listed.path("address").asText());
        assertEquals(fulfillmentId.asText(), assertEnvelope(create(orderId), 200, "OK").path("data").asText());
        String otherId = assertEnvelope(post("/api/v1/fulfillment/orders", Map.of("orderId", orderId, "supplierId", "OTHER")),
                200, "OK").path("data").asText();
        assertFalse(fulfillmentId.asText().equals(otherId));
        assertEquals(2, jdbc.queryForObject("select count(*) from fulfillment_order where order_id=?", Integer.class, orderId));
    }

    @Test
    void acceptFulfillmentTransitionsToAccepted() {
        String id = createId(unique("ORDER-ACCEPT"));

        JsonNode fulfillment = assertEnvelope(accept(id), 200, "OK").path("data");

        assertEquals(id, fulfillment.path("id").asText());
        assertEquals("ACCEPTED", fulfillment.path("status").asText());
    }

    @Test
    void shippingCourierReturnsTrackingNoAndLogisticsCanBeQueried() {
        String id = createId(unique("ORDER-SHIP"));
        accept(id);

        JsonNode shipped = assertEnvelope(ship(id, "courier"), 200, "OK").path("data");
        String trackingNo = shipped.path("tracking_no").asText();

        assertEquals("SHIPPED", shipped.path("status").asText());
        assertEquals("courier", shipped.path("ship_type").asText());
        assertFalse(trackingNo.isBlank());

        JsonNode tracking = assertEnvelope(get("/api/v1/fulfillment/logistics/" + trackingNo), 200, "OK").path("data");
        assertEquals(trackingNo, tracking.path("trackingNo").asText());
        assertEquals("IN_TRANSIT", tracking.path("status").asText());
        assertFalse(tracking.path("latestEvent").asText().isBlank());
    }

    @Test
    void invalidShipTypeReturnsBadRequestEnvelope() {
        String id = createId(unique("ORDER-INVALID-SHIP-TYPE"));
        accept(id);

        JsonNode envelope = assertEnvelope(ship(id, "air"), 400, "BAD_REQUEST");

        assertTrue(envelope.path("data").isNull());
    }

    @Test
    void shippingBeforeAcceptReturnsConflictEnvelope() {
        String id = createId(unique("ORDER-INVALID-STATE"));

        JsonNode envelope = assertEnvelope(ship(id, "courier"), 409, "CONFLICT");

        assertTrue(envelope.path("data").isNull());
    }

    private String createId(String orderId) {
        return assertEnvelope(create(orderId), 200, "OK").path("data").asText();
    }

    private ResponseEntity<JsonNode> create(String orderId) {
        return post("/api/v1/fulfillment/orders", Map.of(
                "orderId", orderId,
                "supplierId", "SUPPLIER-AUDIT"
        ));
    }

    private ResponseEntity<JsonNode> accept(String id) {
        return post("/api/v1/fulfillment/orders/" + id + "/accept", null);
    }

    private ResponseEntity<JsonNode> ship(String id, String shipType) {
        return post("/api/v1/fulfillment/orders/" + id + "/ship", Map.of("shipType", shipType));
    }

    private ResponseEntity<JsonNode> get(String path) {
        return exchange(client.get().uri(path).header("Authorization", "Bearer supplier"));
    }

    private ResponseEntity<JsonNode> post(String path, Object body) {
        RestClient.RequestBodySpec request = client.post().uri(path).contentType(MediaType.APPLICATION_JSON);
        request.header("Authorization", path.equals("/api/v1/fulfillment/orders") ? "Bearer admin" : "Bearer supplier");
        return exchange(body == null ? request : request.body(body));
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

}

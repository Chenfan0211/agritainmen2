package com.agritainmen.fulfillment;

import com.agritainmen.fulfillment.web.FulfillmentAccessVerifier;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
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

@Tag("api-audit")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = "spring.profiles.active=test")
@Import(FulfillmentApiAuditTest.PermitAllApiAuditSecurity.class)
class FulfillmentApiAuditTest {
    @Value("${local.server.port}")
    private int port;

    @Autowired
    private JsonMapper jsonMapper;

    @Autowired
    private JdbcTemplate jdbc;
    @MockitoBean FulfillmentAccessVerifier accessVerifier;

    private RestClient client;

    @BeforeEach
    void setUp() {
        client = RestClient.builder().baseUrl("http://127.0.0.1:" + port).build();
        when(accessVerifier.verify(null)).thenReturn(new FulfillmentAccessVerifier.Identity("admin", "", ""));
        when(accessVerifier.verify("Bearer supplier")).thenReturn(new FulfillmentAccessVerifier.Identity("supplier", "SUPPLIER-AUDIT", ""));
    }

    @Test
    void createFulfillmentReturnsIdInUnifiedEnvelope() {
        String orderId = unique("ORDER-CREATE");

        JsonNode fulfillmentId = assertEnvelope(create(orderId), 200, "OK").path("data");

        assertFalse(fulfillmentId.asText().isBlank());
        assertEquals(orderId, jdbc.queryForObject(
                "select order_id from fulfillment_order where id=?", String.class, fulfillmentId.asText()));
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
        if (!path.equals("/api/v1/fulfillment/orders")) request.header("Authorization", "Bearer supplier");
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
}

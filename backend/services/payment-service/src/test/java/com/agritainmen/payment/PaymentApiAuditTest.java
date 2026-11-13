package com.agritainmen.payment;

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
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@Tag("api-audit")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = "spring.profiles.active=test")
@Import(PaymentApiAuditTest.PermitAllApiAuditSecurity.class)
class PaymentApiAuditTest {
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
    void createIntentReturnsCreatedPaymentInUnifiedEnvelope() {
        String orderId = unique("ORDER-INTENT");

        JsonNode payment = assertEnvelope(createIntent(orderId, 5990), 200, "OK").path("data");

        assertFalse(payment.path("id").asText().isBlank());
        assertEquals(orderId, payment.path("orderId").asText());
        assertEquals(5990L, payment.path("amountCents").asLong());
        assertEquals("WECHAT", payment.path("channel").asText());
        assertEquals("CREATED", payment.path("status").asText());
    }

    @Test
    void successCallbackMarksPaymentAsPaid() {
        String orderId = unique("ORDER-CALLBACK");
        createIntent(orderId, 5990);
        String providerTxnId = unique("TXN");

        JsonNode payment = assertEnvelope(callback(orderId, providerTxnId, true), 200, "OK").path("data");

        assertEquals("PAID", payment.path("status").asText());
        assertEquals(providerTxnId, payment.path("providerTxnId").asText());
        assertFalse(payment.path("paidAt").isNull());
    }

    @Test
    void queryPaymentByOrderReturnsLatestPaymentState() {
        String orderId = unique("ORDER-QUERY");
        createIntent(orderId, 5990);
        callback(orderId, unique("TXN"), true);

        JsonNode payment = assertEnvelope(get("/api/v1/payments/orders/" + orderId), 200, "OK").path("data");

        assertEquals(orderId, payment.path("orderId").asText());
        assertEquals("PAID", payment.path("status").asText());
    }

    @Test
    void duplicateCallbackIsIdempotent() {
        String orderId = unique("ORDER-DUPLICATE-CALLBACK");
        String providerTxnId = unique("TXN");
        createIntent(orderId, 5990);

        JsonNode first = assertEnvelope(callback(orderId, providerTxnId, true), 200, "OK").path("data");
        JsonNode second = assertEnvelope(callback(orderId, providerTxnId, true), 200, "OK").path("data");

        assertEquals("PAID", first.path("status").asText());
        assertEquals("PAID", second.path("status").asText());
        assertEquals(first.path("id").asText(), second.path("id").asText());
        assertEquals(1, jdbc.queryForObject(
                "select count(*) from payment_callback_event where provider_txn_id=?", Integer.class, providerTxnId));
    }

    @Test
    void missingPaymentByOrderReturnsNotFoundEnvelope() {
        String orderId = unique("MISSING-PAYMENT");

        JsonNode envelope = assertEnvelope(get("/api/v1/payments/orders/" + orderId), 404, "NOT_FOUND");

        assertTrue(envelope.path("data").isNull());
    }

    @Test
    void callbackForMissingPaymentReturnsNotFoundEnvelope() {
        String orderId = unique("MISSING-CALLBACK-PAYMENT");

        JsonNode envelope = assertEnvelope(callback(orderId, unique("TXN"), true), 404, "NOT_FOUND");

        assertTrue(envelope.path("data").isNull());
    }

    @Test
    void nonPositiveAmountReturnsBadRequestEnvelope() {
        String orderId = unique("ORDER-INVALID-AMOUNT");

        JsonNode envelope = assertEnvelope(createIntent(orderId, 0), 400, "BAD_REQUEST");

        assertTrue(envelope.path("data").isNull());
    }

    private ResponseEntity<JsonNode> createIntent(String orderId, long amountCents) {
        return post("/api/v1/payments/intents", Map.of(
                "orderId", orderId,
                "amountCents", amountCents,
                "channel", "WECHAT"
        ));
    }

    private ResponseEntity<JsonNode> callback(String orderId, String providerTxnId, boolean success) {
        return post("/api/v1/payments/callback/wechat", Map.of(
                "provider", "WECHAT",
                "providerTxnId", providerTxnId,
                "orderId", orderId,
                "success", success
        ));
    }

    private ResponseEntity<JsonNode> get(String path) {
        return exchange(client.get().uri(path));
    }

    private ResponseEntity<JsonNode> post(String path, Object body) {
        return exchange(client.post().uri(path).contentType(MediaType.APPLICATION_JSON).body(body));
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
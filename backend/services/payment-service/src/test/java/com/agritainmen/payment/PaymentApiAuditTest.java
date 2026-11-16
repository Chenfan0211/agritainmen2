package com.agritainmen.payment;

import com.agritainmen.common.core.BusinessException;
import com.agritainmen.common.core.ErrorCode;
import com.agritainmen.payment.client.OrderPaymentClient;
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
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@Tag("api-audit")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=test", "agritainmen.payment.callback-token=test-callback-token"})
@Import(PaymentApiAuditTest.FakeOrderConfiguration.class)
class PaymentApiAuditTest {
    @Value("${local.server.port}")
    private int port;

    @Autowired
    private JsonMapper jsonMapper;

    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private FakeOrderClient orders;

    private RestClient client;

    @Test
    void composeHealthCheckDoesNotRequireBasicCredentials() {
        int info = client.get().uri("/actuator/info")
                .exchange((request, response) -> response.getStatusCode().value());
        int health = client.get().uri("/actuator/health")
                .exchange((request, response) -> response.getStatusCode().value());
        assertEquals(200, info);
        assertTrue(health == 200 || health == 503);
    }

    @BeforeEach
    void setUp() {
        client = RestClient.builder().baseUrl("http://127.0.0.1:" + port).build();
        orders.cancelled.set(false);
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
    void cancelledOrderAfterSuccessReturnsRefundedPayment() {
        String orderId = unique("ORDER-REFUND");
        createIntent(orderId, 5990);
        orders.cancelled.set(true);

        JsonNode payment = assertEnvelope(callback(orderId, unique("TXN"), true), 200, "OK").path("data");

        assertEquals("REFUNDED", payment.path("status").asText());
        assertEquals("REFUNDED", assertEnvelope(get("/api/v1/payments/orders/" + orderId), 200, "OK")
                .path("data").path("status").asText());
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

    @Test
    void paymentIntentRejectsMissingBuyerTokenAndWrongAmount() {
        String orderId = unique("ORDER-SCOPE");
        assertEnvelope(post("/api/v1/payments/intents", Map.of("orderId", orderId,
                "amountCents", 5990, "channel", "WECHAT"), null), 401, "UNAUTHORIZED");
        assertEnvelope(createIntent(orderId, 6000), 409, "CONFLICT");
    }

    @Test
    void paymentQueryRejectsAnotherBuyer() {
        String orderId = unique("ORDER-QUERY-SCOPE");
        createIntent(orderId, 5990);
        var request = client.get().uri("/api/v1/payments/orders/" + orderId).header("Authorization", "Bearer other");
        assertEnvelope(exchange(request), 401, "UNAUTHORIZED");
    }

    @Test
    void callbackRejectsMissingOrWrongInternalToken() {
        String orderId = unique("ORDER-CALLBACK-SCOPE");
        createIntent(orderId, 5990);
        Map<String, Object> payload = Map.of("provider", "WECHAT", "providerTxnId", unique("TXN"),
                "orderId", orderId, "success", true);
        assertEnvelope(post("/api/v1/payments/callback/wechat", payload, null), 401, "UNAUTHORIZED");
        var wrong = client.post().uri("/api/v1/payments/callback/wechat").contentType(MediaType.APPLICATION_JSON)
                .header("X-Payment-Callback-Token", "wrong").body(payload);
        assertEnvelope(exchange(wrong), 401, "UNAUTHORIZED");
        assertEquals("CREATED", get("/api/v1/payments/orders/" + orderId).getBody().path("data").path("status").asText());
    }

    private ResponseEntity<JsonNode> createIntent(String orderId, long amountCents) {
        return post("/api/v1/payments/intents", Map.of(
                "orderId", orderId,
                "amountCents", amountCents,
                "channel", "WECHAT"
        ), "Bearer buyer-a");
    }

    private ResponseEntity<JsonNode> callback(String orderId, String providerTxnId, boolean success) {
        var payload = Map.of(
                "provider", "WECHAT",
                "providerTxnId", providerTxnId,
                "orderId", orderId,
                "success", success
        );
        return exchange(client.post().uri("/api/v1/payments/callback/wechat").contentType(MediaType.APPLICATION_JSON)
                .header("X-Payment-Callback-Token", "test-callback-token").body(payload));
    }

    private ResponseEntity<JsonNode> get(String path) {
        return exchange(client.get().uri(path).header("Authorization", "Bearer buyer-a"));
    }

    private ResponseEntity<JsonNode> post(String path, Object body, String authorization) {
        var request = client.post().uri(path).contentType(MediaType.APPLICATION_JSON);
        if (authorization != null) request.header("Authorization", authorization);
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
    static class FakeOrderConfiguration {
        @Bean @Primary FakeOrderClient orderPaymentClient() { return new FakeOrderClient(); }
    }

    static class FakeOrderClient implements OrderPaymentClient {
        final AtomicBoolean cancelled = new AtomicBoolean();
        @Override public OrderSnapshot load(String orderId, String authorization) {
            if (!"Bearer buyer-a".equals(authorization)) throw new BusinessException(ErrorCode.UNAUTHORIZED);
            return new OrderSnapshot(orderId, 5990, "PENDING_PAYMENT");
        }
        @Override public String confirm(String orderId, long amountCents) {
            return cancelled.get() ? "UNPAID_CANCELLED" : "PAID";
        }
    }
}

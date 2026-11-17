package com.agritainmen.settlement;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@Tag("api-audit")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = "spring.profiles.active=test")
class SettlementApiAuditTest {
    @LocalServerPort
    private int port;

    @Autowired
    private JsonMapper jsonMapper;

    @Autowired
    private JdbcTemplate jdbc;

    private RestClient restClient;

    @DynamicPropertySource
    static void authUrl(DynamicPropertyRegistry registry) {
        registry.add("agritainmen.clients.auth.base-url", () ->
                "http://127.0.0.1:" + SettlementBearerScopeAuditTest.AUTH.getAddress().getPort());
    }

    @BeforeEach
    void setUp() {
        restClient = RestClient.builder().baseUrl("http://127.0.0.1:" + port).build();
    }

    @Test
    void commissionCreationAndDuplicateSourceUseEnvelope() throws Exception {
        String sourceId = unique("ORDER");
        String beneficiaryId = unique("BENEFICIARY");
        Map<String, Object> request = Map.of(
                "sourceId", sourceId,
                "beneficiaryId", beneficiaryId,
                "amountCents", 500,
                "direction", "LEVEL_1"
        );

        ApiHttpResponse first = post("/api/v1/commissions", request);
        JsonNode firstData = assertSuccess(first);
        String commissionId = firstData.path("id").asText();
        assertAll("佣金响应语义",
                () -> assertFalse(commissionId.isBlank()),
                () -> assertEquals(sourceId, firstData.path("sourceId").asText()),
                () -> assertEquals(beneficiaryId, firstData.path("beneficiaryId").asText()),
                () -> assertEquals(500, firstData.path("amountCents").asLong()),
                () -> assertEquals("AVAILABLE", firstData.path("status").asText())
        );

        ApiHttpResponse duplicate = post("/api/v1/commissions", request);
        JsonNode duplicateData = assertSuccess(duplicate);
        assertEquals(commissionId, duplicateData.path("id").asText(), "相同来源的重复佣金请求应保持幂等");
    }

    @Test
    void withdrawalApprovalSucceedsOnceAndDuplicateApprovalReturns409() throws Exception {
        String requesterId = unique("REQUESTER");
        seedCommission(requesterId, 20000);
        ApiHttpResponse created = post("/api/v1/withdrawals", Map.of(
                "requesterId", requesterId,
                "amountCents", 20000,
                "method", "WECHAT"
        ));
        JsonNode createdData = assertSuccess(created);
        String withdrawalId = createdData.path("id").asText();
        assertEquals("PENDING", createdData.path("status").asText());

        Map<String, Object> review = Map.of(
                "approved", true,
                "operator", "audit-admin",
                "note", "核对通过"
        );
        ApiHttpResponse approved = post("/api/v1/withdrawals/" + withdrawalId + "/review", review);
        JsonNode approvedData = assertSuccess(approved);
        assertAll("首次审批响应语义",
                () -> assertEquals("APPROVED", approvedData.path("status").asText()),
                () -> assertEquals("ADMIN-REVIEW", approvedData.path("reviewedBy").asText()),
                () -> assertFalse(approvedData.path("reviewedAt").isNull())
        );

        ApiHttpResponse duplicate = post("/api/v1/withdrawals/" + withdrawalId + "/review", review);
        assertError(duplicate, 409, "CONFLICT");
    }

    @Test
    void reviewingMissingWithdrawalReturns404() throws Exception {
        ApiHttpResponse response = post("/api/v1/withdrawals/" + unique("MISSING") + "/review", Map.of(
                "approved", false,
                "operator", "audit-admin",
                "note", "不存在"
        ));

        assertError(response, 404, "NOT_FOUND");
    }

    @Test
    void zeroCommissionAmountReturns400() throws Exception {
        ApiHttpResponse response = post("/api/v1/commissions", Map.of(
                "sourceId", unique("ORDER"),
                "beneficiaryId", unique("BENEFICIARY"),
                "amountCents", 0,
                "direction", "LEVEL_1"
        ));

        assertError(response, 400, "BAD_REQUEST");
    }

    @Test
    void negativeWithdrawalAmountReturns400() throws Exception {
        ApiHttpResponse response = post("/api/v1/withdrawals", Map.of(
                "requesterId", unique("REQUESTER"),
                "amountCents", -1,
                "method", "WECHAT"
        ));

        assertError(response, 400, "BAD_REQUEST");
    }

    @Test
    void withdrawalRequiresIdempotencyKey() throws Exception {
        ApiHttpResponse response = post("/api/v1/withdrawals", Map.of(
                "requesterId", unique("REQUESTER"), "amountCents", 100, "method", "WECHAT"), null);
        assertError(response, 400, "BAD_REQUEST");
        ApiHttpResponse oversized = post("/api/v1/withdrawals", Map.of(
                "requesterId", unique("REQUESTER"), "amountCents", 100, "method", "WECHAT"), "X".repeat(129));
        assertError(oversized, 400, "BAD_REQUEST");
    }

    @Test
    void withdrawalReplayKeepsOneApplicationAndRejectsChangedPayload() throws Exception {
        String requesterId = unique("REQUESTER");
        seedCommission(requesterId, 100);
        String key = unique("WITHDRAWAL");
        Map<String, Object> body = Map.of("requesterId", requesterId, "amountCents", 100, "method", "WECHAT");
        String firstId = assertSuccess(post("/api/v1/withdrawals", body, key)).path("id").asText();
        String replayId = assertSuccess(post("/api/v1/withdrawals", body, key)).path("id").asText();
        assertEquals(firstId, replayId);
        assertEquals(1, jdbc.queryForObject("select count(*) from settlement_withdrawal where requester_id=?", Integer.class, requesterId));
        assertError(post("/api/v1/withdrawals", Map.of("requesterId", requesterId,
                "amountCents", 101, "method", "WECHAT"), key), 409, "IDEMPOTENCY_CONFLICT");
        assertError(post("/api/v1/withdrawals", Map.of("requesterId", requesterId,
                "amountCents", 100, "method", "BANK"), key), 409, "IDEMPOTENCY_CONFLICT");
    }

    @Test
    void sameWithdrawalKeyIsIndependentForDifferentRequesters() throws Exception {
        String key = unique("WITHDRAWAL");
        String firstRequester = unique("REQUESTER-A");
        String secondRequester = unique("REQUESTER-B");
        seedCommission(firstRequester, 100);
        seedCommission(secondRequester, 100);
        String first = assertSuccess(post("/api/v1/withdrawals", Map.of(
                "requesterId", firstRequester, "amountCents", 100, "method", "WECHAT"), key)).path("id").asText();
        String second = assertSuccess(post("/api/v1/withdrawals", Map.of(
                "requesterId", secondRequester, "amountCents", 100, "method", "WECHAT"), key)).path("id").asText();
        assertFalse(first.equals(second));
    }

    @Test
    void withdrawalUsesServerBalanceAndRejectedRequestReleasesIt() throws Exception {
        String requesterId = unique("REQUESTER");
        seedCommission(requesterId, 500);
        assertError(post("/api/v1/withdrawals", Map.of("requesterId", requesterId,
                "amountCents", 600, "method", "WECHAT")), 409, "CONFLICT");
        String id = assertSuccess(post("/api/v1/withdrawals", Map.of("requesterId", requesterId,
                "amountCents", 500, "method", "WECHAT"))).path("id").asText();
        assertEquals(0, mine(requesterId).path("availableCents").asLong());
        assertEquals(1, withdrawals(requesterId).size());
        assertError(post("/api/v1/withdrawals", Map.of("requesterId", requesterId,
                "amountCents", 500, "method", "WECHAT")), 409, "CONFLICT");
        assertSuccess(post("/api/v1/withdrawals/" + id + "/review", Map.of("approved", false, "note", "资料不完整")));
        assertEquals(500, mine(requesterId).path("availableCents").asLong());
        assertEquals("REJECTED", withdrawals(requesterId).get(0).path("status").asText());
        assertEquals("资料不完整", withdrawals(requesterId).get(0).path("reviewNote").asText());
        String secondId = assertSuccess(post("/api/v1/withdrawals", Map.of("requesterId", requesterId,
                "amountCents", 500, "method", "WECHAT"))).path("id").asText();
        assertSuccess(post("/api/v1/withdrawals/" + secondId + "/review", Map.of("approved", true)));
        assertEquals(0, mine(requesterId).path("availableCents").asLong());
        assertEquals(0, mine(requesterId).path("withdrawnCents").asLong());
        assertEquals(500, mine(requesterId).path("approvedWithdrawalCents").asLong());
        assertEquals(500, mine(requesterId).path("earnedCents").asLong());
        assertEquals("APPROVED", withdrawals(requesterId).get(0).path("status").asText());
    }

    private JsonNode mine(String requesterId) throws Exception {
        return get("/api/v1/commissions/me?beneficiaryId=" + requesterId);
    }

    private void seedCommission(String requesterId, long amountCents) {
        jdbc.update("insert into settlement_commission(id,tenant_id,source_id,beneficiary_id,amount_cents,direction,status,created_at,updated_at,version,deleted) values (?, 'PLATFORM', ?, ?, ?, 'LEVEL_1', 'AVAILABLE', current_timestamp, current_timestamp, 0, false)", unique("COMMISSION"), unique("SOURCE"), requesterId, amountCents);
    }

    private JsonNode withdrawals(String requesterId) throws Exception {
        return get("/api/v1/withdrawals/me?requesterId=" + requesterId).path("items");
    }

    private JsonNode get(String path) throws Exception {
        RawHttpResponse raw = restClient.get().uri(path)
                .headers(headers -> headers.setBearerAuth("admin-commission"))
                .exchange((sent, response) -> new RawHttpResponse(response.getStatusCode().value(),
                        response.getHeaders().getContentType(), response.getHeaders().getFirst("X-Trace-Id"), response.bodyTo(String.class)));
        return assertSuccess(parse(raw));
    }

    private ApiHttpResponse post(String path, Object requestBody) throws Exception {
        return post(path, requestBody, path.equals("/api/v1/withdrawals") ? unique("WITHDRAWAL") : null);
    }

    private ApiHttpResponse post(String path, Object requestBody, String idempotencyKey) throws Exception {
        var request = restClient.post()
                .uri(path)
                .contentType(MediaType.APPLICATION_JSON)
                .accept(MediaType.APPLICATION_JSON)
                .headers(headers -> headers.setBearerAuth(path.endsWith("/review") ? "admin-review" : "admin-commission"))
                .body(jsonMapper.writeValueAsString(requestBody));
        if (idempotencyKey != null) request.header("Idempotency-Key", idempotencyKey);
        RawHttpResponse raw = request.exchange((sent, response) -> new RawHttpResponse(
                        response.getStatusCode().value(),
                        response.getHeaders().getContentType(),
                        response.getHeaders().getFirst("X-Trace-Id"),
                        response.bodyTo(String.class)
                ));
        return parse(raw);
    }

    private ApiHttpResponse parse(RawHttpResponse raw) throws Exception {
        JsonNode body = raw.body() == null || raw.body().isBlank() ? null : jsonMapper.readTree(raw.body());
        return new ApiHttpResponse(raw.status(), raw.contentType(), raw.traceHeader(), body);
    }

    private static JsonNode assertSuccess(ApiHttpResponse response) {
        assertEquals(200, response.status(), "成功响应应返回 HTTP 200");
        JsonNode data = assertEnvelope(response, "OK");
        assertFalse(data.isNull(), "成功 envelope 的 data 不应为 null");
        return data;
    }

    private static void assertError(ApiHttpResponse response, int expectedStatus, String expectedCode) {
        assertNotNull(response.body(), "错误响应必须包含统一 envelope");
        assertAll("错误响应状态与 envelope",
                () -> assertEquals(expectedStatus, response.status()),
                () -> assertEquals(expectedCode, response.body().path("code").asText()),
                () -> assertTrue(response.body().path("data").isNull()),
                () -> assertEnvelope(response, expectedCode)
        );
    }

    private static JsonNode assertEnvelope(ApiHttpResponse response, String expectedCode) {
        JsonNode body = response.body();
        assertNotNull(body, "响应必须包含 JSON envelope");
        assertTrue(body.isObject(), "envelope 必须是 JSON object");
        assertEquals(5, body.size(), "envelope 必须恰好包含 code/message/data/traceId/timestamp");
        assertTrue(body.has("code"));
        assertTrue(body.has("message"));
        assertTrue(body.has("data"));
        assertTrue(body.has("traceId"));
        assertTrue(body.has("timestamp"));
        assertNotNull(response.contentType());
        assertTrue(response.contentType().isCompatibleWith(MediaType.APPLICATION_JSON), "响应 Content-Type 必须为 JSON");
        assertEquals(expectedCode, body.path("code").asText());
        assertFalse(body.path("message").asText().isBlank(), "message 不应为空");
        assertFalse(body.path("traceId").asText().isBlank(), "traceId 不应为空");
        assertEquals(response.traceHeader(), body.path("traceId").asText(), "X-Trace-Id 应与 envelope.traceId 一致");
        assertDoesNotThrow(() -> Instant.parse(body.path("timestamp").asText()), "timestamp 必须是 ISO-8601 Instant");
        return body.path("data");
    }

    private static String unique(String prefix) {
        return prefix + "-" + UUID.randomUUID();
    }

    private record RawHttpResponse(int status, MediaType contentType, String traceHeader, String body) {
    }

    private record ApiHttpResponse(int status, MediaType contentType, String traceHeader, JsonNode body) {
    }
}

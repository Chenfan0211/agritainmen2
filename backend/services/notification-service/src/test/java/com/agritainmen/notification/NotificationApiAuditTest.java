package com.agritainmen.notification;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.time.Instant;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@Import(NotificationApiAuditTest.AuditTestSecurityConfiguration.class)
@Tag("api-audit")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = "spring.profiles.active=test")
class NotificationApiAuditTest {
    @LocalServerPort
    private int port;

    @Autowired
    private JsonMapper jsonMapper;

    private RestClient restClient;

    @BeforeEach
    void setUp() {
        restClient = RestClient.builder().baseUrl("http://127.0.0.1:" + port).build();
    }

    @Test
    void healthReturnsUnifiedEnvelope() throws Exception {
        ApiHttpResponse response = get("/api/v1/notifications/health");
        JsonNode data = assertSuccess(response);
        assertAll("通知健康检查语义",
                () -> assertEquals("UP", data.path("status").asText()),
                () -> assertEquals("rabbitmq", data.path("channel").asText())
        );
    }

    @Test
    void verificationCodeCanBeSentAndVerified() throws Exception {
        String phone = "13800000000";
        ApiHttpResponse sent = post("/api/v1/notifications/sms/verification-code", Map.of("phone", phone));
        JsonNode sentData = assertSuccess(sent);
        assertAll("发送验证码响应语义",
                () -> assertEquals("sandbox", sentData.path("provider").asText()),
                () -> assertFalse(sentData.path("requestId").asText().isBlank()),
                () -> assertEquals("123456", sentData.path("testCode").asText())
        );

        ApiHttpResponse verified = post("/api/v1/notifications/sms/verify", Map.of(
                "phone", phone,
                "code", sentData.path("testCode").asText()
        ));
        JsonNode verifiedData = assertSuccess(verified);
        assertTrue(verifiedData.isBoolean(), "校验验证码结果应为布尔值");
        assertTrue(verifiedData.asBoolean(), "正确验证码应校验成功");
    }

    @Test
    void wrongVerificationCodeReturnsFalseInSuccessEnvelope() throws Exception {
        ApiHttpResponse response = post("/api/v1/notifications/sms/verify", Map.of(
                "phone", "13800000000",
                "code", "000000"
        ));
        JsonNode data = assertSuccess(response);
        assertTrue(data.isBoolean(), "错误验证码的业务结果应为布尔值");
        assertFalse(data.asBoolean(), "错误验证码应返回 false");
    }

    @Test
    void sendingCodeWithoutPhoneReturns400() throws Exception {
        ApiHttpResponse response = post("/api/v1/notifications/sms/verification-code", Map.of());

        assertError(response, 400, "BAD_REQUEST");
    }

    private ApiHttpResponse get(String path) throws Exception {
        RawHttpResponse raw = restClient.get()
                .uri(path)
                .accept(MediaType.APPLICATION_JSON)
                .headers(headers -> headers.setBasicAuth("api-audit", "api-audit-password"))
                .exchange((request, response) -> new RawHttpResponse(
                        response.getStatusCode().value(),
                        response.getHeaders().getContentType(),
                        response.getHeaders().getFirst("X-Trace-Id"),
                        response.bodyTo(String.class)
                ));
        return parse(raw);
    }

    private ApiHttpResponse post(String path, Object requestBody) throws Exception {
        RawHttpResponse raw = restClient.post()
                .uri(path)
                .contentType(MediaType.APPLICATION_JSON)
                .accept(MediaType.APPLICATION_JSON)
                .headers(headers -> headers.setBasicAuth("api-audit", "api-audit-password"))
                .body(jsonMapper.writeValueAsString(requestBody))
                .exchange((request, response) -> new RawHttpResponse(
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

    private record RawHttpResponse(int status, MediaType contentType, String traceHeader, String body) {
    }

    private record ApiHttpResponse(int status, MediaType contentType, String traceHeader, JsonNode body) {
    }
    @TestConfiguration(proxyBeanMethods = false)
    static class AuditTestSecurityConfiguration {
        @Bean
        @Order(org.springframework.core.Ordered.HIGHEST_PRECEDENCE)
        SecurityFilterChain auditHttpBasicSecurity(HttpSecurity http) throws Exception {
            http
                    .csrf(csrf -> csrf.disable())
                    .authorizeHttpRequests(authorize -> authorize.anyRequest().authenticated())
                    .httpBasic(Customizer.withDefaults());
            return http.build();
        }
    }
}

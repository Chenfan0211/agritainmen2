package com.agritainmen.admin;

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

@Import(AdminApiAuditTest.AuditTestSecurityConfiguration.class)
@Tag("api-audit")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = "spring.profiles.active=test")
class AdminApiAuditTest {
    @LocalServerPort
    private int port;

    @Autowired
    private JsonMapper jsonMapper;

    @Autowired
    private JdbcTemplate jdbc;

    private RestClient restClient;

    @BeforeEach
    void setUp() {
        restClient = RestClient.builder().baseUrl("http://127.0.0.1:" + port).build();
    }

    @Test
    void auditPostAndGetRoundTripThroughHttp() throws Exception {
        String actorId = unique("ACTOR");
        String action = unique("AUDIT_ACTION");

        ApiHttpResponse created = post("/api/v1/admin/audit", Map.of(
                "actorId", actorId,
                "actorRole", "super_admin",
                "module", "orders",
                "action", action,
                "targetId", "ORDER-AUDIT-1",
                "result", "success",
                "reason", "API 审计"
        ));
        JsonNode createdData = assertSuccess(created);
        String auditId = createdData.asText();
        assertFalse(auditId.isBlank(), "POST 审计应返回新增记录 ID");

        ApiHttpResponse listed = get("/api/v1/admin/audit");
        JsonNode rows = assertSuccess(listed);
        assertTrue(rows.isArray(), "GET 审计应返回数组");
        JsonNode saved = findById(rows, auditId);
        assertNotNull(saved, "GET 审计应包含刚写入的记录");
        assertAll("审计日志查询语义",
                () -> assertEquals(actorId, saved.path("actor_id").asText()),
                () -> assertEquals("orders", saved.path("module").asText()),
                () -> assertEquals(action, saved.path("action").asText()),
                () -> assertEquals("ORDER-AUDIT-1", saved.path("target_id").asText()),
                () -> assertEquals("success", saved.path("result").asText())
        );
    }

    @Test
    void dictionaryGetReadsH2RowsThroughHttp() throws Exception {
        String dictionaryId = unique("DICT");
        String groupCode = unique("GROUP");
        String itemCode = unique("ITEM");
        jdbc.update("""
                insert into admin_dictionary(id,tenant_id,group_code,item_code,label,sort_order,enabled,created_at,updated_at,version,deleted)
                values (?, 'PLATFORM', ?, ?, '审计字典项', 9, true, current_timestamp, current_timestamp, 0, false)
                """, dictionaryId, groupCode, itemCode);

        ApiHttpResponse response = get("/api/v1/admin/dictionaries");
        JsonNode rows = assertSuccess(response);
        assertTrue(rows.isArray(), "GET 字典应返回数组");
        JsonNode saved = findBy(rows, "item_code", itemCode);
        assertNotNull(saved, "GET 字典应返回 H2 中的测试数据");
        assertAll("字典查询语义",
                () -> assertEquals(groupCode, saved.path("group_code").asText()),
                () -> assertEquals(itemCode, saved.path("item_code").asText()),
                () -> assertEquals("审计字典项", saved.path("label").asText()),
                () -> assertEquals(9, saved.path("sort_order").asInt()),
                () -> assertTrue(saved.path("enabled").asBoolean())
        );
    }

    @Test
    void auditWithoutActorIdReturns400() throws Exception {
        ApiHttpResponse response = post("/api/v1/admin/audit", Map.of(
                "actorRole", "super_admin",
                "module", "orders",
                "action", "order.audit",
                "result", "success"
        ));

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

    private static JsonNode findById(JsonNode rows, String id) {
        return findBy(rows, "id", id);
    }

    private static JsonNode findBy(JsonNode rows, String field, String value) {
        for (JsonNode row : rows) {
            if (value.equals(row.path(field).asText())) {
                return row;
            }
        }
        return null;
    }

    private static String unique(String prefix) {
        return prefix + "-" + UUID.randomUUID();
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

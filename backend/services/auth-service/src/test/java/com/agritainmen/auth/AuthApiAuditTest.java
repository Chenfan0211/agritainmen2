package com.agritainmen.auth;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@Tag("api-audit")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = "spring.profiles.active=test")
class AuthApiAuditTest {
    @Value("${local.server.port}")
    private int port;

    @Autowired
    private JsonMapper objectMapper;
    @Autowired
    private JdbcTemplate jdbc;

    private RestClient http;

    @BeforeEach
    void setUp() {
        http = RestClient.builder().baseUrl("http://127.0.0.1:" + port).build();
    }

    @Test
    void adminStoreAndSupplierLoginReturnTokenEnvelopes() {
        HttpResult admin = login("/api/v1/auth/admin/login", "admin", "123456");
        assertTokenResponse(admin, "admin");
        String setCookie = admin.headers().getFirst(HttpHeaders.SET_COOKIE);
        assertNotNull(setCookie, "admin login must set the refresh cookie");
        assertTrue(setCookie.contains("agritainmen_admin_refresh="));
        assertTrue(setCookie.contains("HttpOnly"));
        assertTrue(setCookie.contains("Path=/api/v1/auth"));

        assertEquals(401, login("/api/v1/auth/store/login", "13800000000", "123456").status());
        HttpResult supplier = login("/api/v1/auth/supplier/login", "13787366688", "13787366688");
        assertTokenResponse(supplier, "supplier");
        assertFalse(assertOkEnvelope(supplier).path("profile").path("permissions").toString().contains("\"*\""));
        HttpResult driver = login("/api/v1/auth/driver/login", "driver01", "123456");
        assertTokenResponse(driver, "driver");
        assertEquals("S-DEMO-001", assertOkEnvelope(driver).path("profile").path("supplierId").asText());
        assertFalse(assertOkEnvelope(driver).path("profile").path("permissions").toString().contains("\"*\""));
    }

    @Test
    void wechatExchangeReturnsTokenAndLevelOneProfile() {
        HttpResult response = post("/api/v1/auth/wechat/exchange",
                Map.of("app", "user", "code", "mock_openid_demo_level1"), Map.of());

        assertEquals(200, response.status());
        JsonNode data = assertOkEnvelope(response);
        assertTokenFields(data);
        assertEquals("user", data.path("profile").path("actorType").asText());
        assertEquals("level1", data.path("profile").path("level").asText());
        assertTrue(data.path("profile").path("roles").toString().contains("leader:level1"));
    }

    @Test
    void currentProfileKeepsLeaderScopeAndRejectsLoggedOutUserToken() {
        JsonNode login = assertOkEnvelope(post("/api/v1/auth/wechat/exchange",
                Map.of("app", "user", "code", "mock_openid_demo_level1"), Map.of()));
        String access = login.path("accessToken").asText();
        String refresh = login.path("refreshToken").asText();

        JsonNode profile = assertOkEnvelope(get("/api/v1/auth/me", access));
        assertEquals("level1", profile.path("level").asText());
        assertEquals("T001", profile.path("leaderId").asText());
        assertEquals("U-DEMO-L1", profile.path("userId").asText());

        try {
            jdbc.update("update auth_identity set status='disabled' where user_id='U-DEMO-L1'");
            JsonNode disabled = assertOkEnvelope(get("/api/v1/auth/me", access));
            assertEquals("normal", disabled.path("level").asText());
            assertTrue(disabled.path("leaderId").isNull());
        } finally {
            jdbc.update("update auth_identity set status='active' where user_id='U-DEMO-L1'");
        }

        assertEquals(200, post("/api/v1/auth/logout", Map.of("refreshToken", refresh), Map.of()).status());
        assertEquals(401, get("/api/v1/auth/me", access).status());
    }

    @Test
    void currentAdminProfileDropsChangedOrDisabledRolePermissions() {
        String suffix = UUID.randomUUID().toString();
        String accountId = "A-SETTLEMENT-" + suffix;
        String roleId = "R-SETTLEMENT-" + suffix;
        String account = "settlement-" + suffix;
        String passwordHash = jdbc.queryForObject("select password_hash from auth_account where actor_type='admin' and account='admin'", String.class);
        jdbc.update("insert into auth_role(id,tenant_id,code,name,permissions_json,system_role,enabled,created_at,updated_at,version,deleted) values (?, 'PLATFORM', ?, '结算测试', '[\"commission.manage\"]', false, true, current_timestamp, current_timestamp, 0, false)", roleId, account);
        jdbc.update("insert into auth_account(id,tenant_id,actor_type,account,password_hash,display_name,enabled,created_at,updated_at,version,deleted) values (?, 'PLATFORM', 'admin', ?, ?, '结算测试', true, current_timestamp, current_timestamp, 0, false)", accountId, account, passwordHash);
        jdbc.update("insert into auth_account_role(id,tenant_id,account_id,role_id,enabled,created_at,updated_at,version,deleted) values (?, 'PLATFORM', ?, ?, true, current_timestamp, current_timestamp, 0, false)", "AR-" + suffix, accountId, roleId);

        String access = assertOkEnvelope(login("/api/v1/auth/admin/login", account, "123456"))
                .path("accessToken").asText();
        assertTrue(assertOkEnvelope(get("/api/v1/auth/me", access)).path("permissions").toString().contains("commission.manage"));
        jdbc.update("update auth_role set permissions_json='[]' where id=?", roleId);
        assertFalse(assertOkEnvelope(get("/api/v1/auth/me", access)).path("permissions").toString().contains("commission.manage"));
        jdbc.update("update auth_role set permissions_json='[\"commission.manage\"]' where id=?", roleId);
        jdbc.update("update auth_account_role set enabled=false where account_id=?", accountId);
        assertFalse(assertOkEnvelope(get("/api/v1/auth/me", access)).path("permissions").toString().contains("commission.manage"));
    }

    @Test
    void refreshRotatesTokenAndRejectsReplayAsConflict() {
        JsonNode login = assertOkEnvelope(login("/api/v1/auth/admin/login", "admin", "123456"));
        String originalAccess = login.path("accessToken").asText();
        String originalRefresh = login.path("refreshToken").asText();

        HttpResult refreshed = post("/api/v1/auth/refresh",
                Map.of("refreshToken", originalRefresh), Map.of());
        assertEquals(200, refreshed.status());
        JsonNode refreshedData = assertOkEnvelope(refreshed);
        assertTokenFields(refreshedData);
        String rotatedRefresh = refreshedData.path("refreshToken").asText();
        assertFalse(originalRefresh.equals(rotatedRefresh), "refresh token must rotate");

        HttpResult me = get("/api/v1/auth/me", refreshedData.path("accessToken").asText());
        assertEquals(200, me.status());
        assertEquals("admin", assertOkEnvelope(me).path("actorType").asText());
        assertEquals(401, get("/api/v1/auth/me", originalAccess).status());

        HttpResult replay = post("/api/v1/auth/refresh",
                Map.of("refreshToken", originalRefresh), Map.of());
        assertEquals(409, replay.status(), "a reused refresh token is a state conflict");
        assertErrorEnvelope(replay, "CONFLICT");
    }

    @Test
    void logoutRevokesRefreshToken() {
        JsonNode login = assertOkEnvelope(login("/api/v1/auth/supplier/login", "13787366688", "13787366688"));
        String refreshToken = login.path("refreshToken").asText();

        HttpResult logout = post("/api/v1/auth/logout",
                Map.of("refreshToken", refreshToken), Map.of());
        assertEquals(200, logout.status());
        JsonNode logoutData = assertOkEnvelope(logout);
        assertTrue(logoutData.asBoolean(), "logout must report that the session was revoked");

        HttpResult afterLogout = post("/api/v1/auth/refresh",
                Map.of("refreshToken", refreshToken), Map.of());
        assertEquals(401, afterLogout.status());
        assertErrorEnvelope(afterLogout, "UNAUTHORIZED");
    }

    @Test
    void adminLogoutRevokesAccessToken() {
        JsonNode login = assertOkEnvelope(login("/api/v1/auth/admin/login", "admin", "123456"));
        String access = login.path("accessToken").asText();
        String refresh = login.path("refreshToken").asText();
        assertEquals(200, get("/api/v1/auth/me", access).status());
        assertEquals(200, post("/api/v1/auth/logout", Map.of("refreshToken", refresh), Map.of()).status());
        assertEquals(401, get("/api/v1/auth/me", access).status());
        assertEquals(401, get("/api/v1/auth/admin/roles", access).status());
    }

    @Test
    void meUsesOnlyAccessTokens() {
        JsonNode login = assertOkEnvelope(login("/api/v1/auth/admin/login", "admin", "123456"));
        String accessToken = login.path("accessToken").asText();
        String refreshToken = login.path("refreshToken").asText();

        HttpResult me = get("/api/v1/auth/me", accessToken);
        assertEquals(200, me.status());
        JsonNode profile = assertOkEnvelope(me);
        assertEquals("admin", profile.path("actorType").asText());
        assertEquals("超级管理员", login.path("profile").path("displayName").asText());
        assertTrue(profile.path("roles").toString().contains("super_admin"));

        HttpResult refreshAsAccess = get("/api/v1/auth/me", refreshToken);
        assertEquals(401, refreshAsAccess.status(), "a refresh token must not authenticate /me");
        assertErrorEnvelope(refreshAsAccess, "UNAUTHORIZED");
    }

    @Test
    void missingLoginFieldsReturnBadRequest() {
        HttpResult missingLogin = post("/api/v1/auth/admin/login", Map.of(), Map.of());

        assertEquals(400, missingLogin.status());
        assertErrorEnvelope(missingLogin, "BAD_REQUEST");
    }

    @Test
    void wrongPasswordReturnsUnauthorized() {
        HttpResult wrongPassword = post("/api/v1/auth/admin/login",
                Map.of("account", "admin", "password", "incorrect"), Map.of());

        assertEquals(401, wrongPassword.status());
        assertErrorEnvelope(wrongPassword, "UNAUTHORIZED");
    }

    @Test
    void missingRefreshTokenReturnsBadRequest() {
        HttpResult missingRefresh = post("/api/v1/auth/refresh", Map.of(), Map.of());

        assertEquals(400, missingRefresh.status());
        assertErrorEnvelope(missingRefresh, "BAD_REQUEST");
    }

    @Test
    void invalidRefreshTokenReturnsUnauthorized() {
        HttpResult invalidRefresh = post("/api/v1/auth/refresh",
                Map.of("refreshToken", "not-a-jwt"), Map.of());

        assertEquals(401, invalidRefresh.status());
        assertErrorEnvelope(invalidRefresh, "UNAUTHORIZED");
    }
    private HttpResult login(String path, String account, String password) {
        return post(path, Map.of("account", account, "password", password), Map.of());
    }

    private void assertTokenResponse(HttpResult response, String actorType) {
        assertEquals(200, response.status());
        JsonNode data = assertOkEnvelope(response);
        assertTokenFields(data);
        assertEquals(actorType, data.path("profile").path("actorType").asText());
    }

    private void assertTokenFields(JsonNode data) {
        assertTrue(data.path("accessToken").asText().length() > 20);
        assertTrue(data.path("refreshToken").asText().length() > 20);
        assertEquals("Bearer", data.path("tokenType").asText());
        assertTrue(data.path("expiresInSeconds").asLong() > 0);
        assertFalse(data.path("profile").isMissingNode());
    }

    private JsonNode assertOkEnvelope(HttpResult response) {
        assertNotNull(response.body(), response.rawBody());
        JsonNode body = response.body();
        assertEquals("OK", body.path("code").asText());
        assertEquals("success", body.path("message").asText());
        assertFalse(body.path("data").isNull());
        assertEnvelopeMetadata(response);
        return body.path("data");
    }

    private void assertErrorEnvelope(HttpResult response, String expectedCode) {
        assertNotNull(response.body(), response.rawBody());
        JsonNode body = response.body();
        assertEquals(expectedCode, body.path("code").asText());
        assertFalse(body.path("message").asText().isBlank());
        assertTrue(body.path("data").isNull());
        assertEnvelopeMetadata(response);
    }

    private void assertEnvelopeMetadata(HttpResult response) {
        JsonNode body = response.body();
        String traceId = body.path("traceId").asText();
        assertTrue(traceId.matches("[0-9a-f]{32}"), "traceId must be present");
        assertEquals(traceId, response.headers().getFirst("X-Trace-Id"));
        assertDoesNotThrow(() -> Instant.parse(body.path("timestamp").asText()));
    }

    private HttpResult get(String path, String accessToken) {
        return request(HttpMethod.GET, path, null, Map.of(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken));
    }

    private HttpResult post(String path, Object body, Map<String, String> headers) {
        return request(HttpMethod.POST, path, body, headers);
    }

    private HttpResult request(HttpMethod method, String path, Object body, Map<String, String> headers) {
        RestClient.RequestBodySpec request = http.method(method)
                .uri(path)
                .accept(MediaType.APPLICATION_JSON);
        headers.forEach((name, value) -> request.header(name, value));
        if (body != null) request.contentType(MediaType.APPLICATION_JSON).body(body);
        return request.exchange((ignoredRequest, response) -> {
            byte[] bytes = response.getBody().readAllBytes();
            String raw = new String(bytes, StandardCharsets.UTF_8);
            JsonNode json = raw.isBlank() ? null : objectMapper.readTree(raw);
            return new HttpResult(response.getStatusCode().value(), response.getHeaders(), json, raw);
        });
    }

    private record HttpResult(int status, HttpHeaders headers, JsonNode body, String rawBody) {
    }
}

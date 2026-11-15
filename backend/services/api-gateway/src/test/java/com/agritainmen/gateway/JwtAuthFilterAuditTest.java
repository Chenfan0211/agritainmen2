package com.agritainmen.gateway;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.web.server.ServerWebExchange;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@Tag("api-audit")
class JwtAuthFilterAuditTest {
    private static final String SECRET = "integration-test-secret-integration-test-secret-1234";
    private static final String ISSUER = "agritainmen";
    private static final String PROTECTED_PATH = "/api/v1/orders";

    private final SecretKey key = Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8));
    private final JwtAuthFilter filter = new JwtAuthFilter(SECRET);
    private final JsonMapper objectMapper = JsonMapper.builder().build();

    @Test
    void missingTokenReturnsUnauthorizedEnvelopeAndStopsChain() {
        FilterResult result = invoke(PROTECTED_PATH, null);

        assertUnauthorized(result, "UNAUTHORIZED");
        assertFalse(result.chainCalled());
    }

    @Test
    void tokenWithWrongSignatureReturnsUnauthorized() {
        SecretKey wrongKey = Keys.hmacShaKeyFor("wrong-secret-wrong-secret-wrong-secret-123".getBytes(StandardCharsets.UTF_8));
        String token = accessToken(wrongKey, Instant.now().plusSeconds(300));
        FilterResult result = invoke(PROTECTED_PATH, token);

        assertUnauthorized(result, "TOKEN_INVALID");
        assertFalse(result.chainCalled());
    }

    @Test
    void expiredTokenReturnsUnauthorized() {
        String token = accessToken(key, Instant.now().minusSeconds(60));
        FilterResult result = invoke(PROTECTED_PATH, token);

        assertUnauthorized(result, "TOKEN_INVALID");
        assertFalse(result.chainCalled());
    }

    @Test
    void validAccessTokenInjectsTrustedActorHeaders() {
        String token = accessToken(key, Instant.now().plusSeconds(300));
        FilterResult result = invoke(PROTECTED_PATH, token);

        assertTrue(result.chainCalled());
        assertNotNull(result.forwardedExchange());
        HttpHeaders headers = result.forwardedExchange().getRequest().getHeaders();
        assertEquals("admin", headers.getFirst("X-Actor-Type"));
        assertEquals("ACCOUNT-ADMIN", headers.getFirst("X-Actor-Id"));
        assertEquals("PLATFORM", headers.getFirst("X-Tenant-Id"));
    }

    @Test
    void refreshTokenCannotBeUsedAsAccessToken() {
        String token = token(key, "refresh", Instant.now().plusSeconds(300));
        FilterResult result = invoke(PROTECTED_PATH, token);

        assertFalse(result.chainCalled(), "a refresh token must never reach downstream services");
        assertUnauthorized(result, "TOKEN_INVALID");
    }

    @Test
    void onlyConcreteAuthenticationRoutesArePublic() {
        for (String path : List.of("/api/v1/auth/admin/login", "/api/v1/auth/store/login",
                "/api/v1/auth/supplier/login", "/api/v1/auth/driver/login", "/api/v1/auth/wechat/exchange", "/api/v1/auth/refresh")) {
            assertTrue(invoke(HttpMethod.POST, path, null, null).chainCalled(), path);
        }
        assertUnauthorized(invoke("/api/v1/auth/admin/supplier-accounts", null), "UNAUTHORIZED");
        assertUnauthorized(invoke("/api/v1/auth/admin/roles", null), "UNAUTHORIZED");
        assertUnauthorized(invoke("/api/v1/auth/me", null), "UNAUTHORIZED");
        FilterResult publicRequest = invoke(HttpMethod.POST, "/api/v1/auth/admin/login", null, "forged");
        assertTrue(publicRequest.chainCalled());
        assertEquals(null, publicRequest.forwardedExchange().getRequest().getHeaders().get("X-Actor-Type"));
        assertEquals(null, publicRequest.forwardedExchange().getRequest().getHeaders().get("X-Actor-Roles"));
    }

    @Test
    void supplierAndFarmOperationsRequireMatchingPermissions() {
        assertAllowed(HttpMethod.GET, "/api/v1/org/suppliers", "admin", "PLATFORM", List.of("supplier.audit"));
        assertAllowed(HttpMethod.POST, "/api/v1/org/suppliers", "admin", "PLATFORM", List.of("supplier.create"));
        assertAllowed(HttpMethod.PUT, "/api/v1/org/suppliers/S1", "admin", "PLATFORM", List.of("supplier.update"));
        assertDenied(HttpMethod.PUT, "/api/v1/org/suppliers/S1/account", "admin", "PLATFORM", List.of("supplier.account.update"));
        assertAllowed(HttpMethod.POST, "/api/v1/org/suppliers/S1/audit", "admin", "PLATFORM", List.of("supplier.audit"));
        assertAllowed(HttpMethod.POST, "/api/v1/org/suppliers/S1/pause", "admin", "PLATFORM", List.of("supplier.pause"));
        assertAllowed(HttpMethod.GET, "/api/v1/org/farms", "admin", "PLATFORM", List.of("farm.manage"));
        assertAllowed(HttpMethod.GET, "/api/v1/org/farm-accounts/FACC1", "admin", "PLATFORM", List.of("farm.manage"));
        assertDenied(HttpMethod.POST, "/api/v1/org/farm-accounts", "supplier", "PLATFORM", List.of("*"));
        assertDenied(HttpMethod.POST, "/api/v1/org/farm-accounts", "admin", "PLATFORM", List.of("supplier.create"));
        assertAllowed(HttpMethod.PUT, "/api/v1/org/farms/F1", "admin", "PLATFORM", List.of("farm.manage"));
        assertDenied(HttpMethod.POST, "/api/v1/org/suppliers", "admin", "PLATFORM", List.of("supplier.update"));
        assertDenied(HttpMethod.POST, "/api/v1/org/suppliers/S1/audit", "admin", "PLATFORM", List.of("supplier.pause"));
        assertDenied(HttpMethod.GET, "/api/v1/org/farms", "admin", "PLATFORM", List.of("supplier.create"));
        assertDenied(HttpMethod.GET, "/api/v1/org/suppliers", "supplier", "PLATFORM", List.of("*"));
        assertDenied(HttpMethod.GET, "/api/v1/org/drivers", "supplier", "PLATFORM", List.of("driver.manage"));
        assertAllowed(HttpMethod.GET, "/api/v1/org/drivers", "admin", "PLATFORM", List.of("supplier.audit"));
        assertDenied(HttpMethod.GET, "/api/v1/org/suppliers", "admin", "OTHER", List.of("*"));
    }

    @Test
    void authServiceCanReadOnlyExactFarmProfileThroughGateway() {
        String service = token(key, "access", Instant.now().plusSeconds(300), "service", "auth-service",
                "PLATFORM", List.of("farm.inspect"));
        assertTrue(invoke(HttpMethod.GET, "/api/v1/org/farms/F1", service, null).chainCalled());
        assertEquals(HttpStatus.FORBIDDEN, invoke(HttpMethod.GET, "/api/v1/org/farms", service, null).status());
        assertEquals(HttpStatus.FORBIDDEN, invoke(HttpMethod.POST, "/api/v1/org/farms/F1", service, null).status());
        assertEquals(HttpStatus.FORBIDDEN, invoke(HttpMethod.GET, "/api/v1/org/farm-accounts/FACC1", service, null).status());
        String bindingService = token(key, "access", Instant.now().plusSeconds(300), "service", "auth-service",
                "PLATFORM", List.of("farm-account.inspect"));
        assertTrue(invoke(HttpMethod.GET, "/api/v1/org/farm-accounts/FACC1", bindingService, null).chainCalled());
        assertEquals(HttpStatus.FORBIDDEN, invoke(HttpMethod.GET, "/api/v1/org/farms/F1", bindingService, null).status());
    }

    @Test
    void mediaAndSupplierAccountRoutesCheckPlatformAdminPermissions() {
        assertAllowed(HttpMethod.POST, "/api/v1/org/media", "admin", "PLATFORM", List.of("supplier.update"));
        assertAllowed(HttpMethod.POST, "/api/v1/org/media", "admin", "PLATFORM", List.of("farm.manage"));
        assertAllowed(HttpMethod.GET, "/api/v1/org/media/M1", "admin", "PLATFORM", List.of("supplier.audit"));
        assertDenied(HttpMethod.POST, "/api/v1/org/media", "admin", "PLATFORM", List.of("supplier.audit"));
        assertAllowed(HttpMethod.POST, "/api/v1/auth/admin/supplier-accounts", "admin", "PLATFORM", List.of("supplier.audit"));
        assertAllowed(HttpMethod.POST, "/api/v1/auth/admin/store-accounts", "admin", "PLATFORM", List.of("farm.manage"));
        assertAllowed(HttpMethod.GET, "/api/v1/auth/admin/store-accounts", "admin", "PLATFORM", List.of("farm.manage"));
        assertDenied(HttpMethod.POST, "/api/v1/auth/admin/store-accounts", "admin", "PLATFORM", List.of("supplier.audit"));
        assertAllowed(HttpMethod.PUT, "/api/v1/auth/admin/supplier-accounts/A1", "admin", "PLATFORM", List.of("supplier.account.update"));
        assertAllowed(HttpMethod.PATCH, "/api/v1/auth/admin/supplier-accounts/A1", "admin", "PLATFORM", List.of("supplier.account.freeze"));
        assertDenied(HttpMethod.PUT, "/api/v1/auth/admin/supplier-accounts/A1", "admin", "PLATFORM", List.of("supplier.audit"));
    }

    @Test
    void roleAndAccountRoutesRejectUnrelatedAdminPermissions() {
        assertDenied(HttpMethod.GET, "/api/v1/auth/admin/roles", "admin", "PLATFORM", List.of("user.view"));
        assertDenied(HttpMethod.POST, "/api/v1/auth/admin/roles", "admin", "PLATFORM", List.of("user.view"));
        assertDenied(HttpMethod.PUT, "/api/v1/auth/admin/roles/R1/permissions", "admin", "PLATFORM", List.of("admin.role.update"));
        assertDenied(HttpMethod.PUT, "/api/v1/auth/admin/accounts/A1", "admin", "PLATFORM", List.of("user.view"));
        assertAllowed(HttpMethod.GET, "/api/v1/auth/admin/roles", "admin", "PLATFORM", List.of("admin.role.update"));
        assertAllowed(HttpMethod.POST, "/api/v1/auth/admin/roles", "admin", "PLATFORM", List.of("admin.role.create"));
        assertAllowed(HttpMethod.PUT, "/api/v1/auth/admin/roles/R1/permissions", "admin", "PLATFORM", List.of("admin.role.permissions"));
        assertAllowed(HttpMethod.PATCH, "/api/v1/auth/admin/accounts/A1", "admin", "PLATFORM", List.of("admin.account.status"));
    }

    @Test
    void spoofedActorHeadersAreReplacedBySignedClaims() {
        String token = token(key, "access", Instant.now().plusSeconds(300), "admin", "PLATFORM", List.of("supplier.create"));
        FilterResult result = invoke(HttpMethod.POST, "/api/v1/org/suppliers", token, "forged");
        assertTrue(result.chainCalled());
        HttpHeaders headers = result.forwardedExchange().getRequest().getHeaders();
        assertEquals(List.of("admin"), headers.get("X-Actor-Type"));
        assertEquals(List.of("ACCOUNT-ADMIN"), headers.get("X-Actor-Id"));
        assertEquals(List.of("PLATFORM"), headers.get("X-Tenant-Id"));
        assertEquals(null, headers.get("X-Actor-Roles"));
    }

    private void assertAllowed(HttpMethod method, String path, String actorType, String tenantId, List<String> permissions) {
        String token = token(key, "access", Instant.now().plusSeconds(300), actorType, tenantId, permissions);
        assertTrue(invoke(method, path, token, null).chainCalled(), method + " " + path);
    }

    private void assertDenied(HttpMethod method, String path, String actorType, String tenantId, List<String> permissions) {
        String token = token(key, "access", Instant.now().plusSeconds(300), actorType, tenantId, permissions);
        FilterResult result = invoke(method, path, token, null);
        assertFalse(result.chainCalled(), method + " " + path);
        assertEquals(HttpStatus.FORBIDDEN, result.status());
    }

    private FilterResult invoke(String path, String token) {
        return invoke(HttpMethod.GET, path, token, null);
    }

    private FilterResult invoke(HttpMethod method, String path, String token, String spoofedActor) {
        var builder = MockServerHttpRequest.method(method, path);
        if (token != null) builder.header(HttpHeaders.AUTHORIZATION, "Bearer " + token);
        if (spoofedActor != null) builder.header("X-Actor-Type", spoofedActor)
                .header("X-Actor-Id", spoofedActor).header("X-Actor-Roles", spoofedActor)
                .header("X-Tenant-Id", spoofedActor);
        MockServerHttpRequest request = builder.build();
        MockServerWebExchange exchange = MockServerWebExchange.from(request);
        AtomicBoolean chainCalled = new AtomicBoolean(false);
        AtomicReference<ServerWebExchange> forwarded = new AtomicReference<>();
        GatewayFilterChain chain = mutated -> {
            chainCalled.set(true);
            forwarded.set(mutated);
            return mutated.getResponse().setComplete();
        };

        filter.filter(exchange, chain).block(Duration.ofSeconds(5));

        String raw = exchange.getResponse().getBodyAsString().block(Duration.ofSeconds(5));
        JsonNode body = raw == null || raw.isBlank() ? null : objectMapper.readTree(raw);
        return new FilterResult(exchange.getResponse().getStatusCode(),
                exchange.getResponse().getHeaders().getContentType(), body, chainCalled.get(), forwarded.get(),
                exchange.getResponse().getHeaders().getFirst("X-Trace-Id"));
    }

    private void assertUnauthorized(FilterResult result, String expectedCode) {
        assertNotNull(result.status());
        assertEquals(HttpStatus.UNAUTHORIZED.value(), result.status().value());
        assertEquals(MediaType.APPLICATION_JSON, result.contentType());
        assertNotNull(result.body(), "gateway error response must carry an envelope");
        assertEquals(expectedCode, result.body().path("code").asText());
        assertEquals("未登录或登录已失效", result.body().path("message").asText());
        assertTrue(result.body().path("data").isNull());
        assertFalse(result.body().path("traceId").asText().isBlank());
        assertFalse(result.body().path("timestamp").asText().isBlank());
        assertEquals(result.body().path("traceId").asText(), result.traceHeader());
    }

    private String accessToken(SecretKey signingKey, Instant expiration) {
        return token(signingKey, "access", expiration);
    }

    private String token(SecretKey signingKey, String tokenType, Instant expiration) {
        return token(signingKey, tokenType, expiration, "admin", "PLATFORM", List.of("*"));
    }

    private String token(SecretKey signingKey, String tokenType, Instant expiration,
                         String actorType, String tenantId, List<String> permissions) {
        return token(signingKey, tokenType, expiration, actorType, "ACCOUNT-ADMIN", tenantId, permissions);
    }

    private String token(SecretKey signingKey, String tokenType, Instant expiration,
                         String actorType, String actorId, String tenantId, List<String> permissions) {
        Instant now = Instant.now();
        return Jwts.builder()
                .issuer(ISSUER)
                .subject("ACCOUNT-ADMIN")
                .issuedAt(Date.from(now.minusSeconds(600)))
                .expiration(Date.from(expiration))
                .claim("actorType", actorType)
                .claim("actorId", actorId)
                .claim("tenantId", tenantId)
                .claim("roles", List.of("super_admin"))
                .claim("permissions", permissions)
                .claim("tokenType", tokenType)
                .signWith(signingKey)
                .compact();
    }

    private record FilterResult(HttpStatusCode status, MediaType contentType, JsonNode body,
                                boolean chainCalled, ServerWebExchange forwardedExchange, String traceHeader) {
    }
}

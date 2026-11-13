package com.agritainmen.auth;

import com.agritainmen.common.security.JwtService;
import com.agritainmen.common.security.TokenClaims;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.databind.JsonNode;

import java.util.List;
import java.util.Map;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import com.sun.net.httpserver.HttpServer;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = "spring.profiles.active=test")
class SupplierAccountAdminTest {
    static final HttpServer orgServer = startOrgServer();

    @DynamicPropertySource
    static void orgServiceUrl(DynamicPropertyRegistry registry) {
        registry.add("agritainmen.clients.org.base-url", () -> "http://127.0.0.1:" + orgServer.getAddress().getPort());
    }

    private static HttpServer startOrgServer() {
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/api/v1/org/suppliers/", exchange -> {
                String id = exchange.getRequestURI().getPath().substring("/api/v1/org/suppliers/".length());
                int status = exchange.getRequestHeaders().getFirst("Authorization") == null ? 403
                        : "SUP-ERROR".equals(id) ? 500 : "SUP-PENDING".equals(id) ? 200
                        : "SUP-100".equals(id) || "SUP-101".equals(id) ? 200 : 404;
                String body = status == 404 ? "{\"code\":\"NOT_FOUND\",\"data\":null}"
                        : status == 403 ? "{\"code\":\"FORBIDDEN\",\"data\":null}"
                        : "{\"code\":\"OK\",\"data\":{\"id\":\"" + id + "\",\"certified\":" + !"SUP-PENDING".equals(id)
                        + ",\"status\":\"" + ("SUP-PENDING".equals(id) ? "pending" : "cooperating") + "\"}}";
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(status, bytes.length);
                try (var out = exchange.getResponseBody()) { out.write(bytes); }
            });
            server.start();
            return server;
        } catch (java.io.IOException error) { throw new IllegalStateException(error); }
    }
    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    @Autowired JwtService jwtService;
    @Autowired PasswordEncoder encoder;
    RestClient client;
    String adminToken;
    String adminId;

    @BeforeEach
    void setUp() {
        client = RestClient.builder().baseUrl("http://127.0.0.1:" + port).build();
        jdbc.update("delete from auth_session where actor_type='supplier'");
        jdbc.update("delete from auth_account where actor_type='supplier' and account in ('supplier100', 'supplier101')");
        List<String> admins = jdbc.queryForList("select id from auth_account where actor_type='admin' and enabled=true and deleted=false limit 1", String.class);
        if (admins.isEmpty()) {
            jdbc.update("insert into auth_account(id,tenant_id,actor_type,account,password_hash,display_name,enabled,created_at,updated_at,version,deleted) values ('A-SUPPLIER-TEST','PLATFORM','admin','supplier-test-admin','hash','管理员',true,current_timestamp,current_timestamp,0,false)");
            admins = List.of("A-SUPPLIER-TEST");
        }
        adminId = admins.getFirst();
        adminToken = jwtService.createAccessToken(new TokenClaims(adminId, "admin", adminId, "PLATFORM", List.of("super_admin"), List.of("*")));
    }

    @Test
    void generatedPasswordIsReturnedOnceAndRetryKeepsOriginalHash() {
        JsonNode created = provision(Map.of("supplierId", "SUP-100", "account", "supplier100", "displayName", "供应商一"));
        String initialPassword = created.path("data").path("initialPassword").asText();
        assertTrue(initialPassword.length() >= 12);
        assertEquals("SUP-100", created.path("data").path("supplierId").asText());
        String originalHash = jdbc.queryForObject("select password_hash from auth_account where supplier_id='SUP-100'", String.class);
        assertTrue(encoder.matches(initialPassword, originalHash));

        JsonNode retried = provision(Map.of("supplierId", "SUP-100", "account", "supplier100", "displayName", "供应商一", "password", "ignored-password"));
        assertEquals(created.path("data").path("id").asText(), retried.path("data").path("id").asText());
        assertTrue(retried.path("data").path("initialPassword").isNull());
        assertEquals(originalHash, jdbc.queryForObject("select password_hash from auth_account where supplier_id='SUP-100'", String.class));
        assertEquals(1, jdbc.queryForObject("select count(*) from auth_account where supplier_id='SUP-100'", Integer.class));

        JsonNode queried = client.get().uri("/api/v1/auth/admin/supplier-accounts/SUP-100")
                .header("Authorization", "Bearer " + adminToken).retrieve().body(JsonNode.class);
        assertEquals("supplier100", queried.path("data").path("account").asText());
        assertTrue(queried.path("data").path("initialPassword").isMissingNode());

        JsonNode listed = client.get().uri("/api/v1/auth/admin/supplier-accounts")
                .header("Authorization", "Bearer " + adminToken).retrieve().body(JsonNode.class);
        assertTrue(listed.path("data").toString().contains("SUP-100"));
        for (JsonNode item : listed.path("data")) assertTrue(item.path("initialPassword").isMissingNode());
    }

    @Test
    void explicitPasswordCanBeChangedAndAccountDisabled() {
        JsonNode created = provision(Map.of("supplierId", "SUP-101", "account", "supplier101", "displayName", "供应商二", "password", "initial-secret"));
        assertTrue(created.path("data").path("initialPassword").isNull());
        String originalHash = jdbc.queryForObject("select password_hash from auth_account where supplier_id='SUP-101'", String.class);
        assertTrue(encoder.matches("initial-secret", originalHash));
        JsonNode login = client.post().uri("/api/v1/auth/supplier/login")
                .contentType(MediaType.APPLICATION_JSON).body(Map.of("account", "supplier101", "password", "initial-secret"))
                .retrieve().body(JsonNode.class).path("data");
        assertEquals("SUP-101", login.path("profile").path("supplierId").asText());
        String refreshToken = login.path("refreshToken").asText();
        String accessToken = login.path("accessToken").asText();
        assertEquals("SUP-101", client.get().uri("/api/v1/auth/me")
                .header("Authorization", "Bearer " + accessToken).retrieve().body(JsonNode.class)
                .path("data").path("supplierId").asText());

        JsonNode updated = client.patch().uri("/api/v1/auth/admin/supplier-accounts/SUP-101")
                .header("Authorization", "Bearer " + adminToken).contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("displayName", "供应商二新", "enabled", false, "freezeReason", "合同风险", "password", "changed-secret"))
                .retrieve().body(JsonNode.class);
        assertEquals("供应商二新", updated.path("data").path("displayName").asText());
        assertFalse(updated.path("data").path("enabled").asBoolean());
        String changedHash = jdbc.queryForObject("select password_hash from auth_account where supplier_id='SUP-101'", String.class);
        assertNotEquals(originalHash, changedHash);
        assertTrue(encoder.matches("changed-secret", changedHash));
        assertEquals(401, assertThrows(RestClientResponseException.class, () -> client.post().uri("/api/v1/auth/supplier/login")
                .contentType(MediaType.APPLICATION_JSON).body(Map.of("account", "supplier101", "password", "changed-secret"))
                .retrieve().body(JsonNode.class)).getStatusCode().value());
        assertEquals(401, assertThrows(RestClientResponseException.class, () -> client.post().uri("/api/v1/auth/refresh")
                .contentType(MediaType.APPLICATION_JSON).body(Map.of("refreshToken", refreshToken))
                .retrieve().body(JsonNode.class)).getStatusCode().value());
        assertEquals(401, assertThrows(RestClientResponseException.class, () -> client.get().uri("/api/v1/auth/me")
                .header("Authorization", "Bearer " + accessToken).retrieve().body(JsonNode.class)).getStatusCode().value());
    }

    @Test
    void freezeReasonIsRequiredAndSurvivesReloadUntilUnfreeze() {
        provision(Map.of("supplierId", "SUP-100", "account", "supplier100", "displayName", "供应商一"));
        String path = "/api/v1/auth/admin/supplier-accounts/SUP-100";
        assertEquals(400, patchStatus(path, Map.of("enabled", false), adminToken));
        JsonNode frozen = client.patch().uri(path).header("Authorization", "Bearer " + adminToken)
                .contentType(MediaType.APPLICATION_JSON).body(Map.of("enabled", false, "freezeReason", "合同风险"))
                .retrieve().body(JsonNode.class);
        assertEquals("合同风险", frozen.path("data").path("freezeReason").asText());
        assertEquals("合同风险", client.get().uri(path).header("Authorization", "Bearer " + adminToken)
                .retrieve().body(JsonNode.class).path("data").path("freezeReason").asText());
        JsonNode reasonUpdated = client.patch().uri(path).header("Authorization", "Bearer " + adminToken)
                .contentType(MediaType.APPLICATION_JSON).body(Map.of("freezeReason", "资质复核"))
                .retrieve().body(JsonNode.class);
        assertEquals("资质复核", reasonUpdated.path("data").path("freezeReason").asText());
        JsonNode unfrozen = client.patch().uri(path).header("Authorization", "Bearer " + adminToken)
                .contentType(MediaType.APPLICATION_JSON).body(Map.of("enabled", true))
                .retrieve().body(JsonNode.class);
        assertTrue(unfrozen.path("data").path("freezeReason").isNull());
    }

    @Test
    void duplicateLoginNameDoesNotLinkSecondSupplier() {
        provision(Map.of("supplierId", "SUP-100", "account", "supplier100", "displayName", "供应商一"));
        assertEquals(409, assertThrows(RestClientResponseException.class, () ->
                provision(Map.of("supplierId", "SUP-101", "account", "supplier100", "displayName", "供应商二")))
                .getStatusCode().value());
        assertEquals(0, jdbc.queryForObject("select count(*) from auth_account where supplier_id='SUP-101'", Integer.class));
    }

    @Test
    void unlinkedExistingLoginIsNotClaimedByMatchingAccountName() {
        jdbc.update("""
                insert into auth_account(id,tenant_id,actor_type,account,password_hash,display_name,enabled,created_at,updated_at,version,deleted)
                values ('A-UNLINKED','PLATFORM','supplier','supplier100',?,'既有账号',true,current_timestamp,current_timestamp,0,false)
                """, encoder.encode("original-secret"));
        assertEquals(409, assertThrows(RestClientResponseException.class, () ->
                provision(Map.of("supplierId", "SUP-100", "account", "supplier100", "displayName", "供应商一")))
                .getStatusCode().value());
        assertEquals(null, jdbc.queryForObject("select supplier_id from auth_account where id='A-UNLINKED'", String.class));
    }

    @Test
    void adminRoutesRejectAnonymousSupplierAndRefreshTokens() {
        String path = "/api/v1/auth/admin/roles";
        assertEquals(401, assertThrows(RestClientResponseException.class,
                () -> client.get().uri(path).retrieve().body(JsonNode.class)).getStatusCode().value());
        String supplierToken = jwtService.createAccessToken(new TokenClaims("supplier", "supplier", "supplier", "PLATFORM", List.of(), List.of()));
        assertEquals(401, assertThrows(RestClientResponseException.class,
                () -> client.get().uri(path).header("Authorization", "Bearer " + supplierToken).retrieve().body(JsonNode.class)).getStatusCode().value());
        String refreshToken = jwtService.createRefreshToken(new TokenClaims("admin", "admin", "admin", "PLATFORM", List.of(), List.of()));
        assertEquals(401, assertThrows(RestClientResponseException.class,
                () -> client.get().uri(path).header("Authorization", "Bearer " + refreshToken).retrieve().body(JsonNode.class)).getStatusCode().value());
        assertEquals("OK", client.get().uri(path).header("Authorization", "Bearer " + adminToken)
                .retrieve().body(JsonNode.class).path("code").asText());
    }

    @Test
    void directAdminRoutesRejectOtherTenantAndSupplierReadRequiresPermission() {
        assertEquals(403, getStatus("/api/v1/auth/admin/roles", token("OTHER", "*")));
        assertEquals(403, getStatus("/api/v1/auth/admin/supplier-accounts", token("PLATFORM")));
        assertEquals(403, getStatus("/api/v1/auth/admin/supplier-accounts/SUP-100", token("PLATFORM")));
        assertEquals(200, getStatus("/api/v1/auth/admin/supplier-accounts", token("PLATFORM", "supplier.audit")));
    }

    @Test
    void provisionRequiresSupplierAuditPermission() {
        assertEquals(403, postStatus(Map.of("supplierId", "SUP-100", "account", "supplier100", "displayName", "供应商一"),
                token("PLATFORM", "supplier.account.update")));
        assertEquals(0, jdbc.queryForObject("select count(*) from auth_account where account='supplier100'", Integer.class));
        assertEquals(200, postStatus(Map.of("supplierId", "SUP-100", "account", "supplier100", "displayName", "供应商一"),
                token("PLATFORM", "supplier.audit")));
    }

    @Test
    void unapprovedOrUnknownSupplierCannotBeProvisioned() {
        assertEquals(409, postStatus(Map.of("supplierId", "SUP-PENDING", "account", "pending-account", "displayName", "待审供应商"), adminToken));
        assertEquals(404, postStatus(Map.of("supplierId", "SUP-MISSING", "account", "missing-account", "displayName", "未知供应商"), adminToken));
        assertEquals(500, postStatus(Map.of("supplierId", "SUP-ERROR", "account", "error-account", "displayName", "异常供应商"), adminToken));
        assertEquals(0, jdbc.queryForObject("select count(*) from auth_account where account in ('pending-account','missing-account','error-account')", Integer.class));
    }

    @Test
    void patchChecksEachChangedFieldPermission() {
        provision(Map.of("supplierId", "SUP-100", "account", "supplier100", "displayName", "供应商一"));
        String path = "/api/v1/auth/admin/supplier-accounts/SUP-100";
        assertEquals(403, patchStatus(path, Map.of("displayName", "改名"), token("PLATFORM", "supplier.account.freeze")));
        assertEquals(200, patchStatus(path, Map.of("displayName", "改名"), token("PLATFORM", "supplier.account.update")));
        assertEquals(403, patchStatus(path, Map.of("enabled", false), token("PLATFORM", "supplier.account.update")));
        assertEquals(200, patchStatus(path, Map.of("enabled", false, "freezeReason", "合同风险"), token("PLATFORM", "supplier.account.freeze")));
        assertEquals(403, patchStatus(path, Map.of("password", "new-password", "enabled", true), token("PLATFORM", "supplier.account.freeze")));
        assertEquals(403, patchStatus(path, Map.of("password", "new-password", "enabled", true), token("PLATFORM", "supplier.account.update")));
        assertEquals(200, patchStatus(path, Map.of("password", "new-password", "enabled", true),
                token("PLATFORM", "supplier.account.update", "supplier.account.freeze")));
    }

    private String token(String tenant, String... permissions) {
        return jwtService.createAccessToken(new TokenClaims(adminId, "admin", adminId, tenant, List.of(), List.of(permissions)));
    }

    private int getStatus(String path, String token) {
        return client.get().uri(path).header("Authorization", "Bearer " + token)
                .exchange((request, response) -> response.getStatusCode().value());
    }

    private int postStatus(Map<String, Object> body, String token) {
        return client.post().uri("/api/v1/auth/admin/supplier-accounts")
                .header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).body(body)
                .exchange((request, response) -> response.getStatusCode().value());
    }

    private int patchStatus(String path, Map<String, Object> body, String token) {
        return client.patch().uri(path).header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).body(body)
                .exchange((request, response) -> response.getStatusCode().value());
    }

    private JsonNode provision(Map<String, Object> request) {
        return client.post().uri("/api/v1/auth/admin/supplier-accounts")
                .header("Authorization", "Bearer " + adminToken).contentType(MediaType.APPLICATION_JSON)
                .body(request).retrieve().body(JsonNode.class);
    }
}

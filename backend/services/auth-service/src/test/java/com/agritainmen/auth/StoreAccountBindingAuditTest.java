package com.agritainmen.auth;

import com.agritainmen.common.security.JwtService;
import com.agritainmen.common.security.TokenClaims;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.databind.JsonNode;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;

@Tag("api-audit")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = "spring.profiles.active=test")
class StoreAccountBindingAuditTest {
    static final AtomicBoolean ACTIVE = new AtomicBoolean(true);
    static final AtomicReference<String> ROLE = new AtomicReference<>("owner");
    static final HttpServer ORG = orgServer();
    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    @Autowired JwtService jwt;

    @DynamicPropertySource
    static void orgUrl(DynamicPropertyRegistry registry) {
        registry.add("agritainmen.clients.org.base-url", () -> "http://127.0.0.1:" + ORG.getAddress().getPort());
    }

    @Test void provisionedStoreLoginUsesFarmBindingAndStopsWhenOrgDisablesAccount() {
        ACTIVE.set(true);
        ROLE.set("owner");
        RestClient client = RestClient.builder().baseUrl("http://127.0.0.1:" + port).build();
        JsonNode adminLogin = client.post().uri("/api/v1/auth/admin/login").contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("account", "admin", "password", "123456")).retrieve().body(JsonNode.class)
                .path("data");
        String adminId = adminLogin.path("profile").path("actorId").asText();
        String farmAdmin = AuthTestSessions.register(jdbc, adminId, jwt.createAccessToken(new TokenClaims(adminId, "admin", adminId, "PLATFORM",
                List.of("admin"), List.of("farm.manage"))));
        String supplierAdmin = AuthTestSessions.register(jdbc, adminId, jwt.createAccessToken(new TokenClaims(adminId, "admin", adminId, "PLATFORM",
                List.of("admin"), List.of("supplier.audit"))));
        assertEquals(403, assertThrows(RestClientResponseException.class,
                () -> client.post().uri("/api/v1/auth/admin/store-accounts")
                        .header("Authorization", "Bearer " + supplierAdmin).contentType(MediaType.APPLICATION_JSON)
                        .body(Map.of("storeAccountId", "FACC-BIND-1", "password", "bind-secret"))
                        .retrieve().body(JsonNode.class)).getStatusCode().value());
        JsonNode provisioned = client.post().uri("/api/v1/auth/admin/store-accounts")
                .header("Authorization", "Bearer " + farmAdmin).contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("storeAccountId", "FACC-BIND-1", "password", "bind-secret"))
                .retrieve().body(JsonNode.class).path("data");
        assertEquals("F001", provisioned.path("farmId").asText());
        assertEquals("FACC-BIND-1", provisioned.path("storeAccountId").asText());
        JsonNode listed = client.get().uri("/api/v1/auth/admin/store-accounts")
                .header("Authorization", "Bearer " + farmAdmin).retrieve().body(JsonNode.class).path("data");
        assertEquals("FACC-BIND-1", listed.get(0).path("storeAccountId").asText());
        assertTrue(listed.get(0).path("password").isMissingNode());

        JsonNode retried = client.post().uri("/api/v1/auth/admin/store-accounts")
                .header("Authorization", "Bearer " + farmAdmin).contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("storeAccountId", "FACC-BIND-1", "password", "different-secret"))
                .retrieve().body(JsonNode.class).path("data");
        assertEquals(provisioned.path("id").asText(), retried.path("id").asText());
        assertEquals(401, assertThrows(RestClientResponseException.class,
                () -> client.post().uri("/api/v1/auth/store/login").contentType(MediaType.APPLICATION_JSON)
                        .body(Map.of("account", "13999999999", "password", "different-secret"))
                        .retrieve().body(JsonNode.class)).getStatusCode().value());

        JsonNode login = client.post().uri("/api/v1/auth/store/login").contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("account", "13999999999", "password", "bind-secret"))
                .retrieve().body(JsonNode.class).path("data");
        assertEquals("F001", login.path("profile").path("farmId").asText());
        String access = login.path("accessToken").asText();
        String refresh = login.path("refreshToken").asText();
        JsonNode farm = client.get().uri("/api/v1/auth/store/farm")
                .header("Authorization", "Bearer " + access).retrieve().body(JsonNode.class).path("data");
        assertEquals("湖南省门店1号", farm.path("address").asText());
        assertEquals("13900000111", farm.path("contactPhone").asText());
        assertTrue(farm.path("priceLevel").isNull());
        assertEquals("F001", client.get().uri("/api/v1/auth/me").header("Authorization", "Bearer " + access)
                .retrieve().body(JsonNode.class).path("data").path("farmId").asText());
        assertTrue(client.get().uri("/api/v1/auth/me").header("Authorization", "Bearer " + access)
                .retrieve().body(JsonNode.class).path("data").path("userId").isNull());

        ROLE.set("staff");
        assertEquals(401, assertThrows(RestClientResponseException.class,
                () -> client.get().uri("/api/v1/auth/me").header("Authorization", "Bearer " + access)
                        .retrieve().body(JsonNode.class)).getStatusCode().value());
        JsonNode refreshed = client.post().uri("/api/v1/auth/refresh").contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("refreshToken", refresh)).retrieve().body(JsonNode.class).path("data");
        assertTrue(refreshed.path("profile").path("roles").toString().contains("staff"));
        String rotatedAccess = refreshed.path("accessToken").asText();
        String rotatedRefresh = refreshed.path("refreshToken").asText();
        assertEquals("B", client.get().uri("/api/v1/auth/store/farm")
                .header("Authorization", "Bearer " + rotatedAccess).retrieve().body(JsonNode.class)
                .path("data").path("priceLevel").asText());

        ACTIVE.set(false);
        assertEquals(401, assertThrows(RestClientResponseException.class,
                () -> client.get().uri("/api/v1/auth/me").header("Authorization", "Bearer " + rotatedAccess)
                        .retrieve().body(JsonNode.class)).getStatusCode().value());
        assertEquals(401, assertThrows(RestClientResponseException.class,
                () -> client.post().uri("/api/v1/auth/refresh").contentType(MediaType.APPLICATION_JSON)
                        .body(Map.of("refreshToken", rotatedRefresh)).retrieve().body(JsonNode.class)).getStatusCode().value());

        ACTIVE.set(true);
        jdbc.update("delete from auth_account where id=?", provisioned.path("id").asText());
        assertEquals(401, assertThrows(RestClientResponseException.class,
                () -> client.post().uri("/api/v1/auth/refresh").contentType(MediaType.APPLICATION_JSON)
                        .body(Map.of("refreshToken", rotatedRefresh)).retrieve().body(JsonNode.class)).getStatusCode().value());
    }

    static HttpServer orgServer() {
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/api/v1/org/farm-accounts/FACC-BIND-1", exchange -> {
                String body = "{\"code\":\"OK\",\"data\":{\"id\":\"FACC-BIND-1\",\"farm_id\":\"F001\","
                        + "\"account\":\"13999999999\",\"role\":\"" + ROLE.get() + "\",\"price_level\":\"B\",\"enabled\":"
                        + ACTIVE.get() + "}}";
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, bytes.length);
                try (var out = exchange.getResponseBody()) { out.write(bytes); }
            });
            server.createContext("/api/v1/org/farms/F001", exchange -> {
                byte[] bytes = "{\"code\":\"OK\",\"data\":{\"id\":\"F001\",\"name\":\"石板溪\",\"contact\":\"王店长\",\"contactPhone\":\"13900000111\",\"profile\":{\"address\":\"湖南省门店1号\"}}}".getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, bytes.length);
                try (var out = exchange.getResponseBody()) { out.write(bytes); }
            });
            server.start();
            return server;
        } catch (Exception error) { throw new IllegalStateException(error); }
    }
}

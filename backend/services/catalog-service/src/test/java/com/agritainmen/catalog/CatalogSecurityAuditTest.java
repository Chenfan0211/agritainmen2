package com.agritainmen.catalog;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.web.client.RestClient;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;

@Tag("api-audit")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "spring.profiles.active=test")
class CatalogSecurityAuditTest {
    private static final HttpServer AUTH = authServer();
    @Value("${local.server.port}") int port;
    private RestClient client;

    @DynamicPropertySource
    static void authUrl(DynamicPropertyRegistry registry) {
        registry.add("agritainmen.clients.auth.base-url", () -> "http://127.0.0.1:" + AUTH.getAddress().getPort());
    }

    @BeforeEach void setUp() { client = RestClient.builder().baseUrl("http://127.0.0.1:" + port).build(); }

    @Test void catalogReadingWorksWithoutSpringBasicCredentials() {
        int status = client.get().uri("/api/v1/catalog/products")
                .exchange((request, response) -> response.getStatusCode().value());
        assertEquals(200, status);
    }

    @Test void managementWritesRequireCurrentPlatformAdmin() {
        assertEquals(401, createCategory(null));
        assertEquals(403, createCategory("Bearer user-ok"));
        assertEquals(401, createCategory("Bearer revoked"));
        assertEquals(200, createCategory("Bearer admin-ok"));
        assertEquals(403, updatePricingDefaults("Bearer user-ok"));
        assertEquals(200, updatePricingDefaults("Bearer admin-ok"));
    }

    private int createCategory(String authorization) {
        var request = client.post().uri("/api/v1/catalog/categories")
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("code", "SEC-" + UUID.randomUUID(), "name", "鉴权测试"));
        if (authorization != null) request.header("Authorization", authorization);
        return request.exchange((sent, response) -> response.getStatusCode().value());
    }

    private int updatePricingDefaults(String authorization) {
        var request = client.put().uri("/api/v1/catalog/pricing-defaults")
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("storeLevelARate", 0.95));
        if (authorization != null) request.header("Authorization", authorization);
        return request.exchange((sent, response) -> response.getStatusCode().value());
    }

    private static HttpServer authServer() {
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/api/v1/auth/me", exchange -> {
                String token = exchange.getRequestHeaders().getFirst("Authorization");
                int status = "Bearer admin-ok".equals(token) || "Bearer user-ok".equals(token) ? 200 : 401;
                String actor = "Bearer admin-ok".equals(token) ? "admin" : "user";
                String body = status == 200
                        ? "{\"code\":\"OK\",\"data\":{\"actorType\":\"" + actor
                        + "\",\"actorId\":\"A1\",\"tenantId\":\"PLATFORM\"}}"
                        : "{\"code\":\"UNAUTHORIZED\"}";
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(status, bytes.length);
                try (var output = exchange.getResponseBody()) { output.write(bytes); }
            });
            server.start();
            return server;
        } catch (Exception exception) { throw new IllegalStateException(exception); }
    }
}

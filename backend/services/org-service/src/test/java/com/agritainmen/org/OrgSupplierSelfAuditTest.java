package com.agritainmen.org;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.databind.JsonNode;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

@Tag("api-audit")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {"spring.profiles.active=test", "agritainmen.security.org.enabled=false"})
@Import(OrgSupplierSelfAuditTest.PermitAll.class)
class OrgSupplierSelfAuditTest {
    @TestConfiguration(proxyBeanMethods = false)
    static class PermitAll {
        @Bean SecurityFilterChain filter(HttpSecurity http) throws Exception {
            return http.csrf(csrf -> csrf.disable()).authorizeHttpRequests(auth -> auth.anyRequest().permitAll()).build();
        }
    }
    static final HttpServer auth = startAuth();
    @DynamicPropertySource static void authUrl(DynamicPropertyRegistry registry) {
        registry.add("agritainmen.clients.auth.base-url", () -> "http://127.0.0.1:" + auth.getAddress().getPort());
    }
    static HttpServer startAuth() {
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/api/v1/auth/me", exchange -> {
                String token = exchange.getRequestHeaders().getFirst("Authorization");
                int status = "Bearer own".equals(token) || "Bearer driver".equals(token) || "Bearer other".equals(token) ? 200 : 401;
                String body = status == 200
                        ? "{\"code\":\"OK\",\"data\":{\"actorType\":\"" + ("Bearer driver".equals(token) ? "driver" : "supplier")
                            + "\",\"tenantId\":\"PLATFORM\",\"supplierId\":\"" + ("Bearer other".equals(token) ? "S-OTHER" : "S-SELF") + "\"}}"
                        : "{\"code\":\"UNAUTHORIZED\",\"data\":null}";
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(status, bytes.length);
                try (var out = exchange.getResponseBody()) { out.write(bytes); }
            });
            server.start(); return server;
        } catch (java.io.IOException error) { throw new IllegalStateException(error); }
    }
    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;

    private void seedSuppliers() {
        jdbc.update("delete from org_supplier where id in ('S-SELF','S-OTHER')");
        jdbc.update("insert into org_supplier(id,tenant_id,name,contact_phone,status,certified,profile_json,created_at,updated_at,version,deleted) values ('S-SELF','PLATFORM','自有供应商','13900000091','cooperating',true,'{\"brands\":[\"原有品牌\"]}',current_timestamp,current_timestamp,0,false)");
        jdbc.update("insert into org_supplier(id,tenant_id,name,contact_phone,status,certified,profile_json,created_at,updated_at,version,deleted) values ('S-OTHER','PLATFORM','其他供应商','13900000092','cooperating',true,'{}',current_timestamp,current_timestamp,0,false)");
    }

    @Test void readsOnlyBoundSupplierAfterAuthIntrospection() {
        seedSuppliers();
        RestClient client = RestClient.builder().baseUrl("http://127.0.0.1:" + port).build();
        assertEquals(401, assertThrows(RestClientResponseException.class,
                () -> client.get().uri("/api/v1/org/me/supplier").retrieve().body(JsonNode.class)).getStatusCode().value());
        JsonNode own = client.get().uri("/api/v1/org/me/supplier").header("Authorization", "Bearer own")
                .retrieve().body(JsonNode.class).path("data");
        assertEquals("S-SELF", own.path("id").asText());
        assertEquals("自有供应商", own.path("name").asText());
    }

    @Test void supplierWritesOnlyOwnWarehouseWithVersionAndValidation() {
        seedSuppliers();
        RestClient client = RestClient.builder().baseUrl("http://127.0.0.1:" + port).build();
        String path = "/api/v1/org/me/supplier/warehouse";
        Map<String, Object> input = Map.of("address", "湖南省长沙市仓点", "longitude", 112.9, "latitude", 28.2,
                "contactName", "仓管", "contactPhone", "13900000093", "expectedVersion", 0);
        assertEquals(401, assertThrows(RestClientResponseException.class,
                () -> client.put().uri(path).body(input).retrieve().body(JsonNode.class)).getStatusCode().value());
        assertEquals(403, assertThrows(RestClientResponseException.class,
                () -> client.put().uri(path).header("Authorization", "Bearer driver").body(input).retrieve().body(JsonNode.class)).getStatusCode().value());
        JsonNode saved = client.put().uri(path).header("Authorization", "Bearer own").body(input)
                .retrieve().body(JsonNode.class).path("data");
        assertEquals("S-SELF", saved.path("id").asText());
        assertEquals(1, saved.path("version").asInt());
        assertEquals("湖南省长沙市仓点", saved.path("profile").path("warehouse").path("address").asText());
        assertEquals("GCJ-02", saved.path("profile").path("warehouse").path("coordinateSystem").asText());
        assertEquals("原有品牌", saved.path("profile").path("brands").get(0).asText());
        assertEquals(409, assertThrows(RestClientResponseException.class,
                () -> client.put().uri(path).header("Authorization", "Bearer own").body(input).retrieve().body(JsonNode.class)).getStatusCode().value());
        assertEquals(400, assertThrows(RestClientResponseException.class,
                () -> client.put().uri(path).header("Authorization", "Bearer own").body(Map.of("address", "仓点", "longitude", 200, "latitude", 28, "expectedVersion", 1)).retrieve().body(JsonNode.class)).getStatusCode().value());
        assertEquals(400, assertThrows(RestClientResponseException.class,
                () -> client.put().uri(path).header("Authorization", "Bearer own").body(Map.of("address", "仓点", "contactPhone", "123", "expectedVersion", 1)).retrieve().body(JsonNode.class)).getStatusCode().value());
        JsonNode readBack = client.get().uri("/api/v1/org/me/supplier").header("Authorization", "Bearer own")
                .retrieve().body(JsonNode.class).path("data");
        assertEquals("湖南省长沙市仓点", readBack.path("profile").path("warehouse").path("address").asText());
        assertEquals(1, readBack.path("version").asInt());
        JsonNode other = client.put().uri(path).header("Authorization", "Bearer other").body(input)
                .retrieve().body(JsonNode.class).path("data");
        assertEquals("S-OTHER", other.path("id").asText());
        assertEquals(1, readBack.path("version").asInt());
        JsonNode adminUpdated = client.put().uri("/api/v1/org/suppliers/S-SELF")
                .body(Map.of("name", "改名供应商", "contactPhone", "13900000091", "profile", Map.of("brands", java.util.List.of("新品牌"), "warehouse", Map.of("address", "伪造仓点"))))
                .retrieve().body(JsonNode.class).path("data");
        assertEquals("新品牌", adminUpdated.path("profile").path("brands").get(0).asText());
        assertEquals("湖南省长沙市仓点", adminUpdated.path("profile").path("warehouse").path("address").asText());
        assertEquals(409, assertThrows(RestClientResponseException.class,
                () -> client.put().uri(path).header("Authorization", "Bearer own").body(Map.of("address", "迟到的更新", "expectedVersion", 1)).retrieve().body(JsonNode.class)).getStatusCode().value());
    }
}

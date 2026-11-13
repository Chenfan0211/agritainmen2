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
                int status = "Bearer own".equals(token) ? 200 : 401;
                String body = status == 200
                        ? "{\"code\":\"OK\",\"data\":{\"actorType\":\"supplier\",\"tenantId\":\"PLATFORM\",\"supplierId\":\"S-SELF\"}}"
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

    @Test void readsOnlyBoundSupplierAfterAuthIntrospection() {
        jdbc.update("delete from org_supplier where id in ('S-SELF','S-OTHER')");
        jdbc.update("insert into org_supplier(id,tenant_id,name,contact_phone,status,certified,created_at,updated_at,version,deleted) values ('S-SELF','PLATFORM','自有供应商','13900000091','cooperating',true,current_timestamp,current_timestamp,0,false)");
        jdbc.update("insert into org_supplier(id,tenant_id,name,contact_phone,status,certified,created_at,updated_at,version,deleted) values ('S-OTHER','PLATFORM','其他供应商','13900000092','cooperating',true,current_timestamp,current_timestamp,0,false)");
        RestClient client = RestClient.builder().baseUrl("http://127.0.0.1:" + port).build();
        assertEquals(401, assertThrows(RestClientResponseException.class,
                () -> client.get().uri("/api/v1/org/me/supplier").retrieve().body(JsonNode.class)).getStatusCode().value());
        JsonNode own = client.get().uri("/api/v1/org/me/supplier").header("Authorization", "Bearer own")
                .retrieve().body(JsonNode.class).path("data");
        assertEquals("S-SELF", own.path("id").asText());
        assertEquals("自有供应商", own.path("name").asText());
    }
}

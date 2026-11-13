package com.agritainmen.admin;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

@Tag("api-audit")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = "spring.profiles.active=test")
@Import(AdminDictionaryAuditTest.PermitAllApiAuditSecurity.class)
class AdminDictionaryAuditTest {
    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    RestClient client;

    @BeforeEach
    void setUp() {
        client = RestClient.builder().baseUrl("http://localhost:" + port).build();
        jdbc.update("delete from admin_dictionary");
    }

    @Test
    void createsUpdatesAndDeletesDictionaryItem() {
        JsonNode created = client.post().uri("/api/v1/admin/dictionaries").contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("groupCode", "productCategory", "itemCode", "fresh", "label", "生鲜", "sortOrder", 1)).retrieve().body(JsonNode.class);
        assertEquals("OK", created.path("code").asText());

        JsonNode updated = client.put().uri("/api/v1/admin/dictionaries").contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("groupCode", "productCategory", "itemCode", "fresh", "label", "生鲜冻品", "sortOrder", 2)).retrieve().body(JsonNode.class);
        assertEquals("OK", updated.path("code").asText());

        JsonNode deleted = client.delete().uri("/api/v1/admin/dictionaries?groupCode=productCategory&itemCode=fresh").retrieve().body(JsonNode.class);
        assertEquals("OK", deleted.path("code").asText());
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class PermitAllApiAuditSecurity {
        @Bean SecurityFilterChain apiAuditFilterChain(HttpSecurity http) throws Exception {
            return http.csrf(csrf -> csrf.disable()).authorizeHttpRequests(auth -> auth.anyRequest().permitAll()).build();
        }
    }
}

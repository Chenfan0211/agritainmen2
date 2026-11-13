package com.agritainmen.admin;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;

import static org.junit.jupiter.api.Assertions.*;

@Tag("api-audit")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = "spring.profiles.active=test")
@Import(AdminDashboardQueryAuditTest.PermitAllApiAuditSecurity.class)
class AdminDashboardQueryAuditTest {
    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    RestClient client;

    @BeforeEach
    void setUp() {
        client = RestClient.builder().baseUrl("http://localhost:" + port).build();
    }

    @Test
    void dashboardAndReportsReturnEnvelopes() {
        JsonNode dashboard = client.get().uri("/api/v1/admin/dashboard").retrieve().body(JsonNode.class);
        assertEquals("OK", dashboard.path("code").asText());
        assertTrue(dashboard.path("data").has("gmvCents"));
        assertTrue(dashboard.path("data").has("orderCount"));

        JsonNode reports = client.get().uri("/api/v1/admin/reports?from=2026-10-01&to=2026-10-31&page=1&pageSize=20").retrieve().body(JsonNode.class);
        assertEquals("OK", reports.path("code").asText());
        assertTrue(reports.path("data").has("items"));
        assertTrue(reports.path("data").has("total"));
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class PermitAllApiAuditSecurity {
        @Bean SecurityFilterChain apiAuditFilterChain(HttpSecurity http) throws Exception {
            return http.csrf(csrf -> csrf.disable()).authorizeHttpRequests(auth -> auth.anyRequest().permitAll()).build();
        }
    }
}

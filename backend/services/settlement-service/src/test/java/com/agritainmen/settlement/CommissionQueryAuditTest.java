package com.agritainmen.settlement;

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
@Import(CommissionQueryAuditTest.PermitAllApiAuditSecurity.class)
class CommissionQueryAuditTest {
    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    RestClient client;

    @BeforeEach
    void setUp() {
        client = RestClient.builder().baseUrl("http://localhost:" + port).build();
        jdbc.update("delete from settlement_commission");
        jdbc.update("insert into settlement_commission(id,tenant_id,source_id,beneficiary_id,amount_cents,direction,status,created_at,updated_at,version,deleted) values ('C1','PLATFORM','S1','T1',10000,'PROMOTER','AVAILABLE',current_timestamp,current_timestamp,0,false)");
        jdbc.update("insert into settlement_commission(id,tenant_id,source_id,beneficiary_id,amount_cents,direction,status,created_at,updated_at,version,deleted) values ('C2','PLATFORM','S2','T1',5000,'PROMOTER','WITHDRAWN',current_timestamp,current_timestamp,0,false)");
    }

    @Test
    void listsCommissionsAndAggregatesMine() {
        JsonNode list = client.get().uri("/api/v1/commissions?beneficiaryId=T1&page=1&pageSize=20").retrieve().body(JsonNode.class);
        assertEquals("OK", list.path("code").asText());
        assertEquals(2, list.path("data").path("total").asInt());

        JsonNode mine = client.get().uri("/api/v1/commissions/me?beneficiaryId=T1").retrieve().body(JsonNode.class);
        assertEquals("OK", mine.path("code").asText());
        assertEquals(10000, mine.path("data").path("availableCents").asLong());
        assertEquals(5000, mine.path("data").path("withdrawnCents").asLong());
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class PermitAllApiAuditSecurity {
        @Bean SecurityFilterChain apiAuditFilterChain(HttpSecurity http) throws Exception {
            return http.csrf(csrf -> csrf.disable()).authorizeHttpRequests(auth -> auth.anyRequest().permitAll()).build();
        }
    }
}

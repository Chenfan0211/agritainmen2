package com.agritainmen.settlement;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;

import static org.junit.jupiter.api.Assertions.*;

@Tag("api-audit")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = "spring.profiles.active=test")
class CommissionQueryAuditTest {
    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    RestClient client;

    @DynamicPropertySource
    static void authUrl(DynamicPropertyRegistry registry) {
        registry.add("agritainmen.clients.auth.base-url", () ->
                "http://127.0.0.1:" + SettlementBearerScopeAuditTest.AUTH.getAddress().getPort());
    }

    @BeforeEach
    void setUp() {
        client = RestClient.builder().baseUrl("http://localhost:" + port).build();
        jdbc.update("delete from settlement_commission");
        jdbc.update("insert into settlement_commission(id,tenant_id,source_id,beneficiary_id,amount_cents,direction,status,created_at,updated_at,version,deleted) values ('C1','PLATFORM','S1','T1',10000,'PROMOTER','AVAILABLE',current_timestamp,current_timestamp,0,false)");
        jdbc.update("insert into settlement_commission(id,tenant_id,source_id,beneficiary_id,amount_cents,direction,status,created_at,updated_at,version,deleted) values ('C2','PLATFORM','S2','T1',5000,'PROMOTER','WITHDRAWN',current_timestamp,current_timestamp,0,false)");
    }

    @Test
    void listsCommissionsAndAggregatesMine() {
        JsonNode list = client.get().uri("/api/v1/commissions?beneficiaryId=T1&page=1&pageSize=20")
                .header("Authorization", "Bearer admin-commission").retrieve().body(JsonNode.class);
        assertEquals("OK", list.path("code").asText());
        assertEquals(2, list.path("data").path("total").asInt());

        JsonNode mine = client.get().uri("/api/v1/commissions/me?beneficiaryId=T1")
                .header("Authorization", "Bearer admin-commission").retrieve().body(JsonNode.class);
        assertEquals("OK", mine.path("code").asText());
        assertEquals(10000, mine.path("data").path("availableCents").asLong());
        assertEquals(5000, mine.path("data").path("withdrawnCents").asLong());
    }

}

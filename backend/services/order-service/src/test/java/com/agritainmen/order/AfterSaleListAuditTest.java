package com.agritainmen.order;

import com.agritainmen.order.web.OrderAccessVerifier;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
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
@Import(AfterSaleListAuditTest.PermitAllApiAuditSecurity.class)
class AfterSaleListAuditTest {
    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    @MockitoBean OrderAccessVerifier accessVerifier;
    RestClient client;

    @BeforeEach
    void setUp() {
        client = RestClient.builder().baseUrl("http://localhost:" + port).build();
        jdbc.update("delete from after_sale_case");
        jdbc.update("insert into after_sale_case(id,tenant_id,order_id,sub_order_id,buyer_id,supplier_id,type,status,reason,amount_cents,refunded_cents,created_at,updated_at,version,deleted) values ('AS1','PLATFORM','O1','S1','U1','SUP1','refund','processing','破损',10000,0,current_timestamp,current_timestamp,0,false)");
    }

    @Test
    void listsAfterSalesInEnvelope() {
        JsonNode body = client.get().uri("/api/v1/after-sales?page=1&pageSize=20").retrieve().body(JsonNode.class);
        assertEquals("OK", body.path("code").asText());
        assertEquals(1, body.path("data").path("total").asInt());
        assertEquals("AS1", body.path("data").path("items").get(0).path("id").asText());
    }

    @Test
    void rejectsOversizedPage() {
        var ex = assertThrows(org.springframework.web.client.RestClientResponseException.class,
                () -> client.get().uri("/api/v1/after-sales?pageSize=201").retrieve().body(JsonNode.class));
        assertEquals(400, ex.getStatusCode().value());
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class PermitAllApiAuditSecurity {
        @Bean SecurityFilterChain apiAuditFilterChain(HttpSecurity http) throws Exception {
            return http.csrf(csrf -> csrf.disable()).authorizeHttpRequests(auth -> auth.anyRequest().permitAll()).build();
        }
    }
}

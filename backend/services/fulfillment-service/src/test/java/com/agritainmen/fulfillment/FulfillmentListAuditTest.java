package com.agritainmen.fulfillment;

import com.agritainmen.fulfillment.web.FulfillmentAccessVerifier;
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
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import tools.jackson.databind.JsonNode;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;

@Tag("api-audit")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = "spring.profiles.active=test")
@Import(FulfillmentListAuditTest.PermitAllApiAuditSecurity.class)
class FulfillmentListAuditTest {
    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    @MockitoBean FulfillmentAccessVerifier accessVerifier;
    RestClient client;

    @BeforeEach
    void setUp() {
        client = RestClient.builder().baseUrl("http://localhost:" + port).build();
        when(accessVerifier.verify(null)).thenReturn(new FulfillmentAccessVerifier.Identity("admin", "", ""));
        jdbc.update("delete from fulfillment_order");
        for (int i = 1; i <= 3; i++) {
            jdbc.update("insert into fulfillment_order(id,tenant_id,order_id,supplier_id,status,created_at,updated_at,version,deleted) values (?, 'PLATFORM',?,?,?,current_timestamp,current_timestamp,0,false)", "F-" + i, "O-" + i, i < 3 ? "S1" : "S2", "PENDING");
        }
    }

    @Test
    void listsSupplierOrdersWithServerSidePagination() {
        JsonNode response = client.get().uri("/api/v1/fulfillment/orders?supplierId=S1&page=1&pageSize=2").retrieve().body(JsonNode.class);
        assertEquals("OK", response.path("code").asText());
        JsonNode data = response.path("data");
        assertEquals(2, data.path("total").asInt());
        assertEquals(2, data.path("items").size());
        assertEquals("F-1", data.path("items").get(0).path("id").asText());
    }

    @Test
    void rejectsPageSizeAboveMaximum() {
        var exception = assertThrows(org.springframework.web.client.RestClientResponseException.class,
                () -> client.get().uri("/api/v1/fulfillment/orders?supplierId=S1&pageSize=201").retrieve().body(JsonNode.class));
        assertEquals(400, exception.getStatusCode().value());
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class PermitAllApiAuditSecurity {
        @Bean
        SecurityFilterChain apiAuditFilterChain(HttpSecurity http) throws Exception {
            return http.csrf(csrf -> csrf.disable()).authorizeHttpRequests(auth -> auth.anyRequest().permitAll()).build();
        }
    }
}

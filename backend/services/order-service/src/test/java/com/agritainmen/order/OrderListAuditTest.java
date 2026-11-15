package com.agritainmen.order;

import com.agritainmen.order.web.OrderAccessVerifier;
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
@Import(OrderListAuditTest.PermitAllApiAuditSecurity.class)
class OrderListAuditTest {
    @MockitoBean OrderAccessVerifier accessVerifier;
    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    RestClient client;

    @BeforeEach
    void setUp() {
        client = RestClient.builder().baseUrl("http://localhost:" + port).build();
        when(accessVerifier.visibleBuyer(null, "F1")).thenReturn("F1");
        jdbc.update("delete from trade_order_item");
        jdbc.update("delete from trade_order");
        for (int i = 1; i <= 3; i++) {
            jdbc.update("insert into trade_order(id,tenant_id,order_no,buyer_id,status,amount_cents,receiver,receiver_phone,address,created_at,updated_at,version,deleted) values (?, 'PLATFORM', ?, 'F1', 'PENDING_PAYMENT', ?, '张三', '138', '湖南', current_timestamp, current_timestamp, 0, false)", "O-" + i, "NO-" + i, 10000 + i);
        }
    }

    @Test
    void listsOrdersWithServerSidePagination() {
        JsonNode response = client.get().uri("/api/v1/orders?buyerId=F1&page=1&pageSize=2").retrieve().body(JsonNode.class);
        assertEquals("OK", response.path("code").asText());
        JsonNode data = response.path("data");
        assertEquals(3, data.path("total").asInt());
        assertEquals(2, data.path("items").size());
        assertEquals("O-1", data.path("items").get(0).path("id").asText());
    }

    @Test
    void rejectsPageSizeAboveMaximum() {
        var exception = assertThrows(org.springframework.web.client.RestClientResponseException.class,
                () -> client.get().uri("/api/v1/orders?pageSize=201").retrieve().body(JsonNode.class));
        assertEquals(400, exception.getStatusCode().value());
    }

    @Test
    void listExcludesAnotherTenantWithTheSameBuyerId() {
        jdbc.update("insert into trade_order(id,tenant_id,order_no,buyer_id,status,amount_cents,receiver,receiver_phone,address,created_at,updated_at,version,deleted) values ('O-OTHER','OTHER','NO-OTHER','F1','PAID',100,'张三','138','湖南',current_timestamp,current_timestamp,0,false)");
        JsonNode page = client.get().uri("/api/v1/orders?buyerId=F1&page=1&pageSize=20")
                .retrieve().body(JsonNode.class).path("data");
        assertEquals(3, page.path("total").asInt());
        for (JsonNode item : page.path("items")) assertNotEquals("O-OTHER", item.path("id").asText());
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class PermitAllApiAuditSecurity {
        @Bean
        SecurityFilterChain apiAuditFilterChain(HttpSecurity http) throws Exception {
            return http.csrf(csrf -> csrf.disable()).authorizeHttpRequests(auth -> auth.anyRequest().permitAll()).build();
        }
    }
}

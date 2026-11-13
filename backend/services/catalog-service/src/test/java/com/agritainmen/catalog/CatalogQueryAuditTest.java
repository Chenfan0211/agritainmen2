package com.agritainmen.catalog;

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
@Import(CatalogQueryAuditTest.PermitAllApiAuditSecurity.class)
class CatalogQueryAuditTest {
    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    RestClient client;

    @BeforeEach
    void setUp() {
        client = RestClient.builder().baseUrl("http://localhost:" + port).build();
        jdbc.update("delete from catalog_category");
        jdbc.update("delete from catalog_price_policy");
        jdbc.update("insert into catalog_category(id,tenant_id,code,name,sort_order,enabled,created_at,updated_at,version,deleted) values ('C1','PLATFORM','fresh','生鲜',1,true,current_timestamp,current_timestamp,0,false)");
        jdbc.update("insert into catalog_price_policy(id,tenant_id,name,scope,target_id,discount_rate,enabled,created_at,updated_at,version,deleted) values ('PP1','PLATFORM','门店默认','store',null,0.9500,true,current_timestamp,current_timestamp,0,false)");
    }

    @Test
    void listsCategoriesInEnvelope() {
        JsonNode body = client.get().uri("/api/v1/catalog/categories").retrieve().body(JsonNode.class);
        assertEquals("OK", body.path("code").asText());
        assertEquals("生鲜", body.path("data").get(0).path("name").asText());
    }

    @Test
    void listsPricePoliciesInEnvelope() {
        JsonNode body = client.get().uri("/api/v1/catalog/prices").retrieve().body(JsonNode.class);
        assertEquals("OK", body.path("code").asText());
        assertEquals("门店默认", body.path("data").get(0).path("name").asText());
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class PermitAllApiAuditSecurity {
        @Bean SecurityFilterChain apiAuditFilterChain(HttpSecurity http) throws Exception {
            return http.csrf(csrf -> csrf.disable()).authorizeHttpRequests(auth -> auth.anyRequest().permitAll()).build();
        }
    }
}

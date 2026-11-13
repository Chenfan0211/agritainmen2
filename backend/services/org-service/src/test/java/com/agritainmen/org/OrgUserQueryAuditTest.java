package com.agritainmen.org;

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
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"spring.profiles.active=test", "agritainmen.security.org.enabled=false"})
@Import(OrgUserQueryAuditTest.PermitAllApiAuditSecurity.class)
class OrgUserQueryAuditTest {
    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    RestClient client;

    @BeforeEach
    void setUp() {
        client = RestClient.builder().baseUrl("http://localhost:" + port).build();
        jdbc.update("delete from org_user");
        jdbc.update("insert into org_user(id,tenant_id,nickname,phone,level,source_channel,status,created_at,updated_at,version,deleted) values ('U1','PLATFORM','王小满','13800000000','level1','wechat','active',current_timestamp,current_timestamp,0,false)");
    }

    @Test
    void listsUsersInEnvelope() {
        JsonNode body = client.get().uri("/api/v1/org/users?page=1&pageSize=20").retrieve().body(JsonNode.class);
        assertEquals("OK", body.path("code").asText());
        assertEquals(1, body.path("data").path("total").asInt());
        assertEquals("U1", body.path("data").path("items").get(0).path("id").asText());
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class PermitAllApiAuditSecurity {
        @Bean SecurityFilterChain apiAuditFilterChain(HttpSecurity http) throws Exception {
            return http.csrf(csrf -> csrf.disable()).authorizeHttpRequests(auth -> auth.anyRequest().permitAll()).build();
        }
    }
}

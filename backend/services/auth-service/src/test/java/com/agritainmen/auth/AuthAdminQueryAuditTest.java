package com.agritainmen.auth;

import com.agritainmen.common.security.JwtService;
import com.agritainmen.common.security.TokenClaims;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;

import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

@Tag("api-audit")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = "spring.profiles.active=test")

class AuthAdminQueryAuditTest {
    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    @Autowired JwtService jwtService;
    RestClient client;

    @BeforeEach
    void setUp() {
        jdbc.update("delete from auth_account_role where id='AR1'");
        jdbc.update("delete from auth_account where id='A1'");
        jdbc.update("delete from auth_role where id='R1'");
        jdbc.update("insert into auth_role(id,tenant_id,code,name,permissions_json,system_role,enabled,created_at,updated_at,version,deleted) values ('R1','PLATFORM','admin','管理员','[\"user.view\"]',true,true,current_timestamp,current_timestamp,0,false)");
        jdbc.update("insert into auth_account(id,tenant_id,actor_type,account,password_hash,display_name,enabled,created_at,updated_at,version,deleted) values ('A1','PLATFORM','admin','admin-query-test','hash','管理员',true,current_timestamp,current_timestamp,0,false)");
        jdbc.update("insert into auth_account_role(id,tenant_id,account_id,role_id,enabled,created_at,updated_at,version,deleted) values ('AR1','PLATFORM','A1','R1',true,current_timestamp,current_timestamp,0,false)");
        String token = jwtService.createAccessToken(new TokenClaims("A1", "admin", "A1", "PLATFORM", List.of("admin"), List.of("user.view")));
        client = RestClient.builder().baseUrl("http://localhost:" + port)
                .defaultHeader("Authorization", "Bearer " + token).build();
    }

    @Test
    void listsRolesAndAccounts() {
        String token = jwtService.createAccessToken(new TokenClaims("A1", "admin", "A1", "PLATFORM",
                List.of("admin"), List.of("admin.role.update", "admin.account.update")));
        RestClient authorized = RestClient.builder().baseUrl("http://localhost:" + port)
                .defaultHeader("Authorization", "Bearer " + token).build();
        JsonNode roles = authorized.get().uri("/api/v1/auth/admin/roles").retrieve().body(JsonNode.class);
        assertEquals("OK", roles.path("code").asText());
        assertEquals("admin", roles.path("data").get(0).path("code").asText());
        JsonNode accounts = authorized.get().uri("/api/v1/auth/admin/accounts").retrieve().body(JsonNode.class);
        assertEquals("OK", accounts.path("code").asText());
        assertTrue(accounts.path("data").toString().contains("\"account\":\"admin-query-test\""));
    }

    @Test
    void unrelatedAdminPermissionCannotReadOrChangeRolesAndAccounts() {
        int rolesRead = client.get().uri("/api/v1/auth/admin/roles")
                .exchange((request, response) -> response.getStatusCode().value());
        int accountsRead = client.get().uri("/api/v1/auth/admin/accounts")
                .exchange((request, response) -> response.getStatusCode().value());
        int roleUpdate = client.put().uri("/api/v1/auth/admin/roles/R1")
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON).body(java.util.Map.of("name", "越权修改"))
                .exchange((request, response) -> response.getStatusCode().value());
        int roleCreate = client.post().uri("/api/v1/auth/admin/roles")
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .body(java.util.Map.of("code", "escalated", "name", "越权角色", "permissions", List.of("*")))
                .exchange((request, response) -> response.getStatusCode().value());
        assertEquals(403, rolesRead);
        assertEquals(403, accountsRead);
        assertEquals(403, roleUpdate);
        assertEquals(403, roleCreate);
        assertEquals("管理员", jdbc.queryForObject("select name from auth_role where id='R1'", String.class));
        assertEquals(0L, jdbc.queryForObject("select count(*) from auth_role where code='escalated'", Long.class));
    }

    @Test
    void accountStatusPermissionCannotChangeProfileFields() {
        String token = jwtService.createAccessToken(new TokenClaims("A1", "admin", "A1", "PLATFORM",
                List.of("admin"), List.of("admin.account.status")));
        RestClient statusAdmin = RestClient.builder().baseUrl("http://localhost:" + port)
                .defaultHeader("Authorization", "Bearer " + token).build();
        int denied = statusAdmin.patch().uri("/api/v1/auth/admin/accounts/A1")
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .body(java.util.Map.of("displayName", "越权改名"))
                .exchange((request, response) -> response.getStatusCode().value());
        int allowed = statusAdmin.patch().uri("/api/v1/auth/admin/accounts/A1")
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .body(java.util.Map.of("enabled", false))
                .exchange((request, response) -> response.getStatusCode().value());
        assertEquals(403, denied);
        assertEquals(200, allowed);
        assertEquals("管理员", jdbc.queryForObject("select display_name from auth_account where id='A1'", String.class));
    }
}

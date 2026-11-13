package com.agritainmen.auth;

import com.agritainmen.common.security.JwtService;
import com.agritainmen.common.security.TokenClaims;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

@Tag("api-audit")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = "spring.profiles.active=test")
class AuthAdminWriteAuditTest {
    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    @Autowired JwtService jwtService;
    RestClient client;

    @BeforeEach
    void setUp() {
        jdbc.update("delete from auth_account_role where account_id in (select id from auth_account where account='ops01') or role_id in (select id from auth_role where code='ops')");
        jdbc.update("delete from auth_account where account='ops01' or id='A-ADMIN-TEST'");
        jdbc.update("delete from auth_role where code='ops' or id='R-DUP-WRITE'");
        jdbc.update("insert into auth_account(id,tenant_id,actor_type,account,password_hash,display_name,enabled,created_at,updated_at,version,deleted) values ('A-ADMIN-TEST','PLATFORM','admin','admin-test','hash','管理员',true,current_timestamp,current_timestamp,0,false)");
        String token = jwtService.createAccessToken(new TokenClaims("A-ADMIN-TEST", "admin", "A-ADMIN-TEST", "PLATFORM", List.of(), List.of("*")));
        client = RestClient.builder().baseUrl("http://localhost:" + port)
                .defaultHeader("Authorization", "Bearer " + token).build();
    }

    @Test
    void createsRoleUpdatesPermissionsAndCreatesAccount() {
        JsonNode role = client.post().uri("/api/v1/auth/admin/roles").contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("code", "ops", "name", "运营", "permissions", List.of("user.view", "product.create"))).retrieve().body(JsonNode.class);
        assertEquals("OK", role.path("code").asText());
        String roleId = role.path("data").path("id").asText();

        JsonNode permission = client.put().uri("/api/v1/auth/admin/roles/" + roleId + "/permissions").contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("permissions", List.of("user.view"))).retrieve().body(JsonNode.class);
        assertEquals("OK", permission.path("code").asText());

        JsonNode account = client.post().uri("/api/v1/auth/admin/accounts").contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("account", "ops01", "password", "123456", "displayName", "运营一号", "roleId", roleId)).retrieve().body(JsonNode.class);
        assertEquals("OK", account.path("code").asText());
        String accountId = account.path("data").path("id").asText();

        JsonNode disabled = client.patch().uri("/api/v1/auth/admin/accounts/" + accountId).contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("enabled", false)).retrieve().body(JsonNode.class);
        assertEquals(false, disabled.path("data").path("enabled").asBoolean());
    }

    @Test
    void rejectsDuplicateRoleCode() {
        jdbc.update("insert into auth_role(id,tenant_id,code,name,system_role,enabled,created_at,updated_at,version,deleted) values ('R-DUP-WRITE','PLATFORM','ops','运营',false,true,current_timestamp,current_timestamp,0,false)");
        var ex = assertThrows(org.springframework.web.client.RestClientResponseException.class,
                () -> client.post().uri("/api/v1/auth/admin/roles").contentType(MediaType.APPLICATION_JSON)
                        .body(Map.of("code", "ops", "name", "运营2", "permissions", List.of())).retrieve().body(JsonNode.class));
        assertEquals(409, ex.getStatusCode().value());
    }
}

package com.agritainmen.auth;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.databind.JsonNode;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = "spring.profiles.active=test")
class DriverAccountTest {
    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    @Autowired PasswordEncoder encoder;
    RestClient client;
    String supplierToken;

    @BeforeEach void setUp() {
        client = RestClient.builder().baseUrl("http://127.0.0.1:" + port).build();
        jdbc.update("delete from auth_session where actor_type='driver'");
        jdbc.update("delete from auth_account where actor_type='driver' and account='driverrealtest'");
        jdbc.update("delete from auth_session where actor_id='A-OTHER-DRIVER-TEST'");
        jdbc.update("delete from auth_account where id='A-OTHER-DRIVER-TEST'");
        supplierToken = client.post().uri("/api/v1/auth/supplier/login").contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("account", "13787366688", "password", "13787366688"))
                .retrieve().body(JsonNode.class).path("data").path("accessToken").asText();
    }

    @Test void supplierCreatesDriverAndDriverLoginIsRevocable() {
        JsonNode created = client.post().uri("/api/v1/auth/supplier/drivers")
                .header("Authorization", "Bearer " + supplierToken).contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("name", "测试司机", "phone", "13900000012", "account", "driverrealtest", "password", "first-secret"))
                .retrieve().body(JsonNode.class).path("data");
        String driverId = created.path("id").asText();
        assertEquals("S-DEMO-001", created.path("supplierId").asText());
        jdbc.update("insert into auth_account(id,tenant_id,actor_type,supplier_id,account,password_hash,display_name,enabled,created_at,updated_at,version,deleted) values ('A-OTHER-DRIVER-TEST','PLATFORM','supplier','S-OTHER-DRIVER-TEST','otherdriverowner',?,'其他供应商',true,current_timestamp,current_timestamp,0,false)", encoder.encode("other-secret"));
        String otherToken = client.post().uri("/api/v1/auth/supplier/login").contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("account", "otherdriverowner", "password", "other-secret"))
                .retrieve().body(JsonNode.class).path("data").path("accessToken").asText();
        assertEquals(404, assertThrows(RestClientResponseException.class,
                () -> client.patch().uri("/api/v1/auth/supplier/drivers/" + driverId)
                        .header("Authorization", "Bearer " + otherToken).contentType(MediaType.APPLICATION_JSON)
                        .body(Map.of("enabled", false)).retrieve().body(JsonNode.class)).getStatusCode().value());
        assertEquals(0, client.get().uri("/api/v1/auth/supplier/drivers")
                .header("Authorization", "Bearer " + otherToken).retrieve().body(JsonNode.class).path("data").size());
        JsonNode login = client.post().uri("/api/v1/auth/driver/login").contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("account", "driverrealtest", "password", "first-secret"))
                .retrieve().body(JsonNode.class).path("data");
        assertEquals(driverId, login.path("profile").path("driverId").asText());
        assertEquals("S-DEMO-001", login.path("profile").path("supplierId").asText());
        String access = login.path("accessToken").asText();
        JsonNode rotated = client.post().uri("/api/v1/auth/refresh").contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("refreshToken", login.path("refreshToken").asText()))
                .retrieve().body(JsonNode.class).path("data");
        assertEquals(401, assertThrows(RestClientResponseException.class,
                () -> client.get().uri("/api/v1/auth/me").header("Authorization", "Bearer " + access)
                        .retrieve().body(JsonNode.class)).getStatusCode().value());
        String currentAccess = rotated.path("accessToken").asText();
        String currentRefresh = rotated.path("refreshToken").asText();
        JsonNode disabled = client.patch().uri("/api/v1/auth/supplier/drivers/" + driverId)
                .header("Authorization", "Bearer " + supplierToken).contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("enabled", false)).retrieve().body(JsonNode.class).path("data");
        assertFalse(disabled.path("enabled").asBoolean());
        assertEquals(401, assertThrows(RestClientResponseException.class,
                () -> client.get().uri("/api/v1/auth/me").header("Authorization", "Bearer " + currentAccess)
                        .retrieve().body(JsonNode.class)).getStatusCode().value());
        assertEquals(401, assertThrows(RestClientResponseException.class,
                () -> client.post().uri("/api/v1/auth/refresh").contentType(MediaType.APPLICATION_JSON)
                        .body(Map.of("refreshToken", currentRefresh))
                        .retrieve().body(JsonNode.class)).getStatusCode().value());
    }

    @Test void freezingSupplierRevokesDriverAccessEvenAfterUnfreeze() {
        JsonNode driverLogin = client.post().uri("/api/v1/auth/driver/login").contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("account", "driver01", "password", "123456"))
                .retrieve().body(JsonNode.class).path("data");
        String access = driverLogin.path("accessToken").asText();
        String adminToken = client.post().uri("/api/v1/auth/admin/login").contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("account", "admin", "password", "123456"))
                .retrieve().body(JsonNode.class).path("data").path("accessToken").asText();
        try {
            client.patch().uri("/api/v1/auth/admin/supplier-accounts/S-DEMO-001")
                    .header("Authorization", "Bearer " + adminToken).contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("enabled", false, "freezeReason", "联调冻结"))
                    .retrieve().body(JsonNode.class);
            assertEquals(401, assertThrows(RestClientResponseException.class,
                    () -> client.get().uri("/api/v1/auth/me").header("Authorization", "Bearer " + access)
                            .retrieve().body(JsonNode.class)).getStatusCode().value());
            assertEquals(401, assertThrows(RestClientResponseException.class,
                    () -> client.post().uri("/api/v1/auth/refresh").contentType(MediaType.APPLICATION_JSON)
                            .body(Map.of("refreshToken", driverLogin.path("refreshToken").asText()))
                            .retrieve().body(JsonNode.class)).getStatusCode().value());
        } finally {
            client.patch().uri("/api/v1/auth/admin/supplier-accounts/S-DEMO-001")
                    .header("Authorization", "Bearer " + adminToken).contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("enabled", true)).retrieve().body(JsonNode.class);
        }
        assertEquals(401, assertThrows(RestClientResponseException.class,
                () -> client.get().uri("/api/v1/auth/me").header("Authorization", "Bearer " + access)
                        .retrieve().body(JsonNode.class)).getStatusCode().value());
    }
}

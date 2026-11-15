package com.agritainmen.org;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

@Tag("api-audit")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"spring.profiles.active=test", "agritainmen.security.org.enabled=false"})
@Import(OrgWriteAuditTest.PermitAllApiAuditSecurity.class)
class OrgWriteAuditTest {
    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    RestClient client;

    @BeforeEach
    void setUp() {
        client = RestClient.builder().baseUrl("http://localhost:" + port).build();
        jdbc.update("delete from org_supplier");
        jdbc.update("delete from org_farm");
        jdbc.update("delete from org_farm_account");
        jdbc.update("delete from org_promoter");
        jdbc.update("delete from org_driver");
    }

    @Test
    void listsFarmAccountsForAdminRecovery() {
        jdbc.update("insert into org_farm_account(id,tenant_id,farm_id,account,display_name,role,enabled,created_at,updated_at,version,deleted) values ('FACC-LIST','PLATFORM','F1','13900000111','店员','staff',true,current_timestamp,current_timestamp,0,false)");
        JsonNode rows = client.get().uri("/api/v1/org/farm-accounts").retrieve().body(JsonNode.class).path("data");
        assertEquals("FACC-LIST", rows.get(0).path("id").asText());
        assertEquals("F1", rows.get(0).path("farm_id").asText());
    }

    @Test
    void readsOneFarmForAuthServiceProfile() {
        jdbc.update("insert into org_farm(id,tenant_id,name,status,contact,contact_phone,profile_json,created_at,updated_at,version,deleted) values ('F-SELF','PLATFORM','石板溪','active','王店长','13900000111','{\"address\":\"湖南省门店1号\"}',current_timestamp,current_timestamp,0,false)");
        JsonNode farm = client.get().uri("/api/v1/org/farms/F-SELF").retrieve().body(JsonNode.class).path("data");
        assertEquals("石板溪", farm.path("name").asText());
        assertEquals("湖南省门店1号", farm.path("profile").path("address").asText());
    }

    @Test
    void createsSupplierAndTransitionsStatus() {
        JsonNode created = client.post().uri("/api/v1/org/suppliers").contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("name", "湘西腊味", "region", "湘西", "contactPhone", "13787366688")).retrieve().body(JsonNode.class);
        String id = created.path("data").path("id").asText();
        assertFalse(id.isBlank());
        assertEquals(409, assertThrows(org.springframework.web.client.RestClientResponseException.class,
                () -> client.post().uri("/api/v1/org/suppliers/" + id + "/pause")
                        .contentType(MediaType.APPLICATION_JSON).body(Map.of("reason", "资质复核"))
                        .retrieve().body(JsonNode.class)).getStatusCode().value());
        JsonNode audited = client.post().uri("/api/v1/org/suppliers/" + id + "/audit")
                .contentType(MediaType.APPLICATION_JSON).body(Map.of("approved", true))
                .retrieve().body(JsonNode.class);
        assertTrue(audited.path("data").path("certified").asBoolean());
        assertEquals("cooperating", audited.path("data").path("status").asText());

        JsonNode paused = client.post().uri("/api/v1/org/suppliers/" + id + "/pause")
                .contentType(MediaType.APPLICATION_JSON).body(Map.of("reason", "资质复核"))
                .retrieve().body(JsonNode.class);
        assertEquals("paused", paused.path("data").path("status").asText());
        JsonNode resumed = client.post().uri("/api/v1/org/suppliers/" + id + "/resume").retrieve().body(JsonNode.class);
        assertEquals("cooperating", resumed.path("data").path("status").asText());
        assertEquals(409, assertThrows(org.springframework.web.client.RestClientResponseException.class,
                () -> client.post().uri("/api/v1/org/suppliers/" + id + "/restore")
                        .retrieve().body(JsonNode.class)).getStatusCode().value());
    }

    @Test
    void rejectedSupplierCannotResumeBeforeReaudit() {
        String id = client.post().uri("/api/v1/org/suppliers").contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("name", "待审供应商", "contactPhone", "13787366689"))
                .retrieve().body(JsonNode.class).path("data").path("id").asText();
        client.post().uri("/api/v1/org/suppliers/" + id + "/audit")
                .contentType(MediaType.APPLICATION_JSON).body(Map.of("approved", false))
                .retrieve().body(JsonNode.class);
        assertEquals(409, assertThrows(org.springframework.web.client.RestClientResponseException.class,
                () -> client.post().uri("/api/v1/org/suppliers/" + id + "/resume")
                        .retrieve().body(JsonNode.class)).getStatusCode().value());
        JsonNode restored = client.post().uri("/api/v1/org/suppliers/" + id + "/restore")
                .retrieve().body(JsonNode.class);
        assertEquals("pending", restored.path("data").path("status").asText());
    }

    @Test
    void createsFarmAccountAndPromoter() {
        JsonNode farm = client.post().uri("/api/v1/org/farms").contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("name", "石板溪", "region", "湘西", "profile", Map.of("address", "湖南省湘西州石板溪1号"))).retrieve().body(JsonNode.class);
        String farmId = farm.path("data").path("id").asText();

        JsonNode account = client.post().uri("/api/v1/org/farm-accounts").contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("farmId", farmId, "account", "13800000000", "displayName", "王店长", "role", "owner")).retrieve().body(JsonNode.class);
        assertEquals("OK", account.path("code").asText());
        String accountId = account.path("data").path("id").asText();
        JsonNode persisted = client.get().uri("/api/v1/org/farm-accounts/" + accountId).retrieve().body(JsonNode.class);
        assertEquals(farmId, persisted.path("data").path("farm_id").asText());
        assertEquals("owner", persisted.path("data").path("role").asText());

        JsonNode promoter = client.post().uri("/api/v1/org/promoters").contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("name", "李业务", "level", "level1", "region", "湘西")).retrieve().body(JsonNode.class);
        assertEquals("OK", promoter.path("code").asText());
    }

    @Test
    void createsDriverAndUpdatesStatus() {
        JsonNode created = client.post().uri("/api/v1/org/drivers").contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("supplierId", "S1", "name", "张伟", "phone", "139")).retrieve().body(JsonNode.class);
        String id = created.path("data").path("id").asText();
        JsonNode toggled = client.patch().uri("/api/v1/org/drivers/" + id).contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("status", "inactive")).retrieve().body(JsonNode.class);
        assertEquals("inactive", toggled.path("data").path("status").asText());
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class PermitAllApiAuditSecurity {
        @Bean SecurityFilterChain apiAuditFilterChain(HttpSecurity http) throws Exception {
            return http.csrf(csrf -> csrf.disable()).authorizeHttpRequests(auth -> auth.anyRequest().permitAll()).build();
        }
    }
}

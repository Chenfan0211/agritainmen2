package com.agritainmen.catalog;

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
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = "spring.profiles.active=test")
@Import(CatalogWriteAuditTest.PermitAllApiAuditSecurity.class)
class CatalogWriteAuditTest {
    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    RestClient client;

    @BeforeEach
    void setUp() {
        client = RestClient.builder().baseUrl("http://localhost:" + port).build();
        jdbc.update("delete from catalog_sku");
        jdbc.update("delete from catalog_product");
        jdbc.update("delete from catalog_category");
        jdbc.update("delete from catalog_price_policy");
    }

    @Test
    void createsUpdatesAndDeletesCategory() {
        JsonNode created = client.post().uri("/api/v1/catalog/categories").contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("code", "fresh", "name", "生鲜", "sortOrder", 1)).retrieve().body(JsonNode.class);
        assertEquals("OK", created.path("code").asText());
        String id = created.path("data").path("id").asText();
        assertFalse(id.isBlank());

        JsonNode updated = client.put().uri("/api/v1/catalog/categories/" + id).contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("name", "生鲜冻品", "sortOrder", 2)).retrieve().body(JsonNode.class);
        assertEquals("生鲜冻品", updated.path("data").path("name").asText());

        JsonNode deleted = client.delete().uri("/api/v1/catalog/categories/" + id).retrieve().body(JsonNode.class);
        assertEquals("OK", deleted.path("code").asText());
    }

    @Test
    void rejectsCategoryDeleteWhenReferenced() {
        jdbc.update("insert into catalog_category(id,tenant_id,code,name,sort_order,enabled,created_at,updated_at,version,deleted) values ('C-REF','PLATFORM','ref','被引用',1,true,current_timestamp,current_timestamp,0,false)");
        jdbc.update("insert into catalog_product(id,tenant_id,supplier_id,name,category,channel,enabled,created_at,updated_at,version,deleted) values ('P-REF','PLATFORM','S1','商品','ref','store',true,current_timestamp,current_timestamp,0,false)");
        var ex = assertThrows(org.springframework.web.client.RestClientResponseException.class,
                () -> client.delete().uri("/api/v1/catalog/categories/C-REF").retrieve().body(JsonNode.class));
        assertEquals(409, ex.getStatusCode().value());
    }

    @Test
    void savesProductAndTogglesStatus() {
        JsonNode created = client.post().uri("/api/v1/catalog/products").contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("supplierId", "S1", "name", "腊肉", "category", "fresh", "channel", "store",
                        "skus", java.util.List.of(Map.of("id", "SKU1", "name", "500g", "priceCents", 5990)))).retrieve().body(JsonNode.class);
        assertEquals("OK", created.path("code").asText());
        String id = created.path("data").path("id").asText();

        JsonNode toggled = client.patch().uri("/api/v1/catalog/products/" + id).contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("enabled", false)).retrieve().body(JsonNode.class);
        assertEquals(false, toggled.path("data").path("enabled").asBoolean());
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class PermitAllApiAuditSecurity {
        @Bean SecurityFilterChain apiAuditFilterChain(HttpSecurity http) throws Exception {
            return http.csrf(csrf -> csrf.disable()).authorizeHttpRequests(auth -> auth.anyRequest().permitAll()).build();
        }
    }
}

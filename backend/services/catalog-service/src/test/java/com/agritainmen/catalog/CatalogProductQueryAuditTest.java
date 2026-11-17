package com.agritainmen.catalog;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;

import static org.junit.jupiter.api.Assertions.*;

@Tag("api-audit")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = "spring.profiles.active=test")
class CatalogProductQueryAuditTest {
    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    RestClient client;

    @BeforeEach
    void setUp() {
        client = RestClient.builder().baseUrl("http://localhost:" + port).build();
        jdbc.update("delete from catalog_sku");
        jdbc.update("delete from catalog_product");
        for (int i = 1; i <= 3; i++) {
            jdbc.update("insert into catalog_product(id,tenant_id,supplier_id,name,category,channel,enabled,created_at,updated_at,version,deleted) values (?, 'PLATFORM','S1',?,'fresh','store',true,current_timestamp,current_timestamp,0,false)", "P-" + i, "Product " + i);
            jdbc.update("insert into catalog_sku(id,tenant_id,product_id,name,price_cents,enabled,created_at,updated_at,version,deleted) values (?, 'PLATFORM',?, '500g', ?, true,current_timestamp,current_timestamp,0,false)", "SKU-" + i, "P-" + i, 1000 + i);
        }
    }

    @Test
    void listsEnabledProductsWithServerSidePagination() {
        JsonNode response = client.get().uri("/api/v1/catalog/products?page=1&pageSize=2&channel=store").retrieve().body(JsonNode.class);
        assertEquals("OK", response.path("code").asText());
        JsonNode data = response.path("data");
        assertEquals(3, data.path("total").asInt());
        assertEquals(1, data.path("page").asInt());
        assertEquals(2, data.path("pageSize").asInt());
        assertEquals(2, data.path("items").size());
        assertEquals("P-1", data.path("items").get(0).path("id").asText());
        assertEquals(1, data.path("items").get(0).path("skus").size());
    }

    @Test
    void liveAndStoreFiltersIncludeAllChannelAndPageByProduct() {
        jdbc.update("update catalog_product set channel='all' where id='P-1'");
        jdbc.update("update catalog_product set channel='live' where id='P-2'");
        jdbc.update("insert into catalog_sku(id,tenant_id,product_id,name,price_cents,enabled,created_at,updated_at,version,deleted) values ('SKU-1-B','PLATFORM','P-1','1kg',2000,true,current_timestamp,current_timestamp,0,false)");
        JsonNode first = client.get().uri("/api/v1/catalog/products?page=1&pageSize=1&channel=live")
                .retrieve().body(JsonNode.class).path("data");
        assertEquals(2, first.path("total").asInt());
        assertEquals(1, first.path("items").size());
        assertEquals("P-1", first.path("items").get(0).path("id").asText());
        assertEquals(2, first.path("items").get(0).path("skus").size());
        JsonNode second = client.get().uri("/api/v1/catalog/products?page=2&pageSize=1&channel=live")
                .retrieve().body(JsonNode.class).path("data");
        assertEquals("P-2", second.path("items").get(0).path("id").asText());
        JsonNode store = client.get().uri("/api/v1/catalog/products?page=1&pageSize=2&channel=store")
                .retrieve().body(JsonNode.class).path("data");
        assertEquals(2, store.path("total").asInt());
        assertEquals("P-3", store.path("items").get(1).path("id").asText());
    }

    @Test
    void excludesOtherTenantProductsAndSkus() {
        jdbc.update("insert into catalog_product(id,tenant_id,supplier_id,name,category,channel,enabled,created_at,updated_at,version,deleted) values ('P-OTHER','OTHER','S1','Other','fresh','store',true,current_timestamp,current_timestamp,0,false)");
        jdbc.update("insert into catalog_sku(id,tenant_id,product_id,name,price_cents,enabled,created_at,updated_at,version,deleted) values ('SKU-OTHER','OTHER','P-OTHER','500g',1000,true,current_timestamp,current_timestamp,0,false)");
        jdbc.update("insert into catalog_sku(id,tenant_id,product_id,name,price_cents,enabled,created_at,updated_at,version,deleted) values ('SKU-FOREIGN','OTHER','P-1','1kg',2000,true,current_timestamp,current_timestamp,0,false)");
        JsonNode data = client.get().uri("/api/v1/catalog/products?page=1&pageSize=10&channel=store")
                .retrieve().body(JsonNode.class).path("data");
        assertEquals(3, data.path("total").asInt());
        assertEquals(3, data.path("items").size());
        assertEquals(1, data.path("items").get(0).path("skus").size());
    }

    @Test
    void rejectsPageSizeAboveServerMaximum() {
        var exception = assertThrows(org.springframework.web.client.RestClientResponseException.class,
                () -> client.get().uri("/api/v1/catalog/products?page=1&pageSize=201").retrieve().body(JsonNode.class));
        assertEquals(400, exception.getStatusCode().value());
        assertTrue(exception.getResponseBodyAsString().contains("BAD_REQUEST"));
    }

}

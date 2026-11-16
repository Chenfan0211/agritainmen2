package com.agritainmen.inventory;

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
class InventoryBatchAuditTest {
    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    RestClient client;

    @BeforeEach
    void setUp() {
        client = RestClient.builder().baseUrl("http://localhost:" + port).build();
        jdbc.update("delete from inventory_stock");
        jdbc.update("insert into inventory_stock(id,tenant_id,sku_id,available_qty,reserved_qty,created_at,updated_at,version,deleted) values ('ST1','PLATFORM','SKU1',8,2,current_timestamp,current_timestamp,0,false)");
        jdbc.update("insert into inventory_stock(id,tenant_id,sku_id,available_qty,reserved_qty,created_at,updated_at,version,deleted) values ('ST2','PLATFORM','SKU2',3,0,current_timestamp,current_timestamp,0,false)");
    }

    @Test
    void returnsAvailableQuantitiesForMultipleSkus() {
        JsonNode response = client.get().uri("/api/v1/inventory/available?skuIds=SKU1,SKU2,SKU-MISSING").retrieve().body(JsonNode.class);
        assertEquals("OK", response.path("code").asText());
        assertEquals(8, response.path("data").path("SKU1").asInt());
        assertEquals(3, response.path("data").path("SKU2").asInt());
        assertEquals(0, response.path("data").path("SKU-MISSING").asInt());
    }

}

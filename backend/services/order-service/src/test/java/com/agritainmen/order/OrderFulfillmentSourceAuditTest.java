package com.agritainmen.order;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.*;

@Tag("api-audit")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"spring.profiles.active=test", "agritainmen.security.order-source.enabled=true"})
class OrderFulfillmentSourceAuditTest {
    static final HttpServer auth = startAuth();

    @DynamicPropertySource
    static void authUrl(DynamicPropertyRegistry registry) {
        registry.add("agritainmen.clients.auth.base-url", () -> "http://127.0.0.1:" + auth.getAddress().getPort());
    }

    private static HttpServer startAuth() {
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/api/v1/auth/me", exchange -> {
                String token = exchange.getRequestHeaders().getFirst("Authorization");
                String actor = "Bearer supplier".equals(token) ? "supplier" : "admin";
                String tenant = "Bearer other-admin".equals(token) ? "OTHER" : "PLATFORM";
                byte[] bytes = ("{\"code\":\"OK\",\"data\":{\"actorType\":\"" + actor
                        + "\",\"tenantId\":\"" + tenant + "\"}}").getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, bytes.length);
                try (var out = exchange.getResponseBody()) { out.write(bytes); }
            });
            server.start();
            return server;
        } catch (Exception error) { throw new IllegalStateException(error); }
    }

    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    @Autowired JsonMapper jsonMapper;
    RestClient client;

    @BeforeEach void setUp() {
        client = RestClient.builder().baseUrl("http://127.0.0.1:" + port).build();
        jdbc.update("delete from trade_order_item where order_id='O-SOURCE'");
        jdbc.update("delete from trade_order where id='O-SOURCE'");
        jdbc.update("insert into trade_order(id,tenant_id,order_no,buyer_id,status,amount_cents,receiver,receiver_phone,address,created_at,updated_at,version,deleted) values ('O-SOURCE','PLATFORM','NO-SOURCE','F1','PAID',100,'店长','13800000000','长沙市',current_timestamp,current_timestamp,0,false)");
        jdbc.update("insert into trade_order_item(id,tenant_id,order_id,sku_id,product_id,supplier_id,product_name,unit_price_cents,quantity,amount_cents,created_at,updated_at,version,deleted) values ('I-SOURCE','PLATFORM','O-SOURCE','SKU-1','P1','S1','商品',100,1,100,current_timestamp,current_timestamp,0,false)");
    }

    @Test void onlyVerifiedAdminReadsFulfillmentSource() {
        assertEquals(401, get(null).getStatusCode().value());
        assertEquals(403, get("Bearer supplier").getStatusCode().value());
        assertEquals(403, get("Bearer other-admin").getStatusCode().value());
        ResponseEntity<JsonNode> response = get("Bearer admin");
        assertEquals(200, response.getStatusCode().value());
        JsonNode order = response.getBody().path("data");
        assertEquals("F1", order.path("buyerId").asText());
        assertEquals("长沙市", order.path("address").asText());
        assertEquals("S1", order.path("items").get(0).path("supplierId").asText());
    }

    private ResponseEntity<JsonNode> get(String authorization) {
        var request = client.get().uri("/api/v1/orders/O-SOURCE/fulfillment-source");
        if (authorization != null) request.header("Authorization", authorization);
        return request.exchange((sent, response) -> {
            byte[] bytes = response.getBody().readAllBytes();
            return new ResponseEntity<>(bytes.length == 0 ? null : jsonMapper.readTree(bytes),
                    response.getHeaders(), response.getStatusCode());
        });
    }
}

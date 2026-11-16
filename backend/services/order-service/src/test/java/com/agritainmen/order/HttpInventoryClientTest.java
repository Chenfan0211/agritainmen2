package com.agritainmen.order;

import com.agritainmen.common.core.BusinessException;
import com.agritainmen.common.core.ErrorCode;
import com.agritainmen.order.client.HttpServiceClients;
import com.agritainmen.order.client.InventoryClient;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.databind.json.JsonMapper;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class HttpInventoryClientTest {
    private HttpServer server;
    private InventoryClient client;
    private volatile String responseCode;
    private final List<String> internalTokens = new CopyOnWriteArrayList<>();

    @BeforeEach void setUp() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/api/v1/inventory/reservations", exchange -> {
            internalTokens.add(exchange.getRequestHeaders().getFirst("X-Inventory-Internal-Token"));
            byte[] body = ("{\"code\":\"" + responseCode + "\",\"message\":\"库存不足\"}")
                    .getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(409, body.length);
            try (var output = exchange.getResponseBody()) { output.write(body); }
        });
        server.start();
        client = new HttpServiceClients().inventoryClient("http://127.0.0.1:" + server.getAddress().getPort(),
                JsonMapper.builder().build(), "test-inventory-token");
    }

    @AfterEach void tearDown() { server.stop(0); }

    @Test void mapsOnlyExplicitOutOfStockToTerminalFailure() {
        responseCode = "OUT_OF_STOCK";
        assertEquals(ErrorCode.OUT_OF_STOCK, assertThrows(BusinessException.class,
                () -> client.reserve("O1", List.of(new InventoryClient.Line("SKU-1", 1)), Instant.now())).errorCode());
        responseCode = "CONFLICT";
        assertEquals(409, assertThrows(RestClientResponseException.class,
                () -> client.reserve("O2", List.of(new InventoryClient.Line("SKU-1", 1)), Instant.now()))
                .getStatusCode().value());
    }

    @Test void sendsInternalTokenForEveryInventoryWriteAndFailsClosedWhenUnconfigured() {
        responseCode = "CONFLICT";
        assertThrows(RestClientResponseException.class,
                () -> client.reserve("O3", List.of(new InventoryClient.Line("SKU-1", 1)), Instant.now()));
        assertThrows(RestClientResponseException.class, () -> client.release("RES-O3"));
        assertThrows(RestClientResponseException.class, () -> client.confirm("RES-O3"));
        assertEquals(List.of("test-inventory-token", "test-inventory-token", "test-inventory-token"), internalTokens);

        InventoryClient unconfigured = new HttpServiceClients().inventoryClient(
                "http://127.0.0.1:" + server.getAddress().getPort(), JsonMapper.builder().build(), "");
        assertThrows(IllegalStateException.class,
                () -> unconfigured.reserve("O4", List.of(new InventoryClient.Line("SKU-1", 1)), Instant.now()));
        assertEquals(3, internalTokens.size());
    }
}

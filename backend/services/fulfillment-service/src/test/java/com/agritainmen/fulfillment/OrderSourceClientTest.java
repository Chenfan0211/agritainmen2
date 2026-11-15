package com.agritainmen.fulfillment;

import com.agritainmen.common.core.BusinessException;
import com.agritainmen.common.core.ErrorCode;
import com.agritainmen.fulfillment.client.OrderSourceClient;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.*;

class OrderSourceClientTest {
    private HttpServer server;
    private OrderSourceClient client;

    @BeforeEach void setUp() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/api/v1/orders/", exchange -> {
            String id = exchange.getRequestURI().getPath().replace("/api/v1/orders/", "").replace("/fulfillment-source", "");
            assertTrue(exchange.getRequestURI().getPath().endsWith("/fulfillment-source"));
            String token = exchange.getRequestHeaders().getFirst("Authorization");
            int status = "missing".equals(id) ? 404 : 200;
            String body = "missing".equals(id) ? "{\"code\":\"NOT_FOUND\",\"data\":null}"
                    : "broken".equals(id) ? "{\"code\":\"BAD_REQUEST\",\"data\":null}"
                    : "mixed".equals(id) ? "{\"code\":\"OK\",\"data\":{\"id\":\"mixed\",\"buyerId\":\"F1\","
                    + "\"receiver\":\"店长\",\"receiverPhone\":\"13800000000\",\"address\":\"长沙市\","
                    + "\"items\":[{\"supplierId\":\"S1\"},{\"supplierId\":\"S2\"}]}}"
                    : "Bearer admin".equals(token) ? "{\"code\":\"OK\",\"data\":{\"id\":\"" + id
                    + "\",\"buyerId\":\"F1\",\"receiver\":\"店长\",\"receiverPhone\":\"13800000000\","
                    + "\"address\":\"长沙市望城区 1 号\",\"items\":[{\"supplierId\":\"S1\"}]}}"
                    : "{\"code\":\"UNAUTHORIZED\",\"data\":null}";
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(status, bytes.length);
            try (var out = exchange.getResponseBody()) { out.write(bytes); }
        });
        server.start();
        client = new OrderSourceClient("http://127.0.0.1:" + server.getAddress().getPort());
    }

    @AfterEach void tearDown() { server.stop(0); }

    @Test void loadsServerOrderAndChecksSupplier() {
        var source = client.load("O1", "S1", "Bearer admin");
        assertEquals("F1", source.buyerId());
        assertEquals("长沙市望城区 1 号", source.address());
        assertEquals("店长", source.receiver());
        assertEquals("13800000000", source.receiverPhone());
        assertEquals(ErrorCode.FORBIDDEN, assertThrows(BusinessException.class,
                () -> client.load("O1", "S2", "Bearer admin")).errorCode());
    }

    @Test void missingOrInvalidOrderFailsClosed() {
        assertEquals(ErrorCode.NOT_FOUND, assertThrows(BusinessException.class,
                () -> client.load("missing", "S1", "Bearer admin")).errorCode());
        assertEquals(ErrorCode.INTERNAL_ERROR, assertThrows(BusinessException.class,
                () -> client.load("broken", "S1", "Bearer admin")).errorCode());
    }

    @Test void mixedSupplierOrderCannotBeClaimedAsOneFulfillment() {
        assertEquals(ErrorCode.CONFLICT, assertThrows(BusinessException.class,
                () -> client.load("mixed", "S1", "Bearer admin")).errorCode());
    }
}

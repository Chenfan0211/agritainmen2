package com.agritainmen.payment;

import com.agritainmen.common.core.BusinessException;
import com.agritainmen.common.core.ErrorCode;
import com.agritainmen.payment.client.HttpOrderPaymentClient;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class HttpOrderPaymentClientTest {
    private HttpServer server;
    private HttpOrderPaymentClient client;
    private final AtomicInteger confirmations = new AtomicInteger();

    @BeforeEach void setUp() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/api/v1/orders/", exchange -> {
            String path = exchange.getRequestURI().getPath();
            String body;
            int status;
            if (path.endsWith("/payment-confirmation")) {
                confirmations.incrementAndGet();
                String token = exchange.getRequestHeaders().getFirst("X-Order-Payment-Token");
                String request = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
                status = "internal-secret".equals(token) && request.contains("\"amountCents\":5990") ? 200 : 401;
                body = status == 200 ? "{\"code\":\"OK\",\"data\":{\"id\":\"O1\",\"amountCents\":5990,\"status\":\"PAID\"}}"
                        : "{\"code\":\"UNAUTHORIZED\",\"data\":null}";
            } else {
                String token = exchange.getRequestHeaders().getFirst("Authorization");
                status = "Bearer buyer-a".equals(token) ? 200 : 404;
                body = status == 200 ? "{\"code\":\"" + (path.endsWith("/BAD") ? "BAD_REQUEST" : "OK")
                        + "\",\"data\":{\"id\":\"" + (path.endsWith("/BAD") ? "BAD" : "O1")
                        + "\",\"amountCents\":5990,\"status\":\"PENDING_PAYMENT\"}}"
                        : "{\"code\":\"NOT_FOUND\",\"data\":null}";
            }
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(status, bytes.length);
            try (var out = exchange.getResponseBody()) { out.write(bytes); }
        });
        server.start();
        client = new HttpOrderPaymentClient("http://127.0.0.1:" + server.getAddress().getPort(), "internal-secret");
    }

    @AfterEach void tearDown() { server.stop(0); }

    @Test void forwardsBuyerBearerAndInternalPaymentToken() {
        assertEquals(5990, client.load("O1", "Bearer buyer-a").amountCents());
        assertEquals("PAID", client.confirm("O1", 5990));
        assertEquals(1, confirmations.get());
    }

    @Test void foreignBuyerCannotReadPaymentSource() {
        assertEquals(ErrorCode.NOT_FOUND, assertThrows(BusinessException.class,
                () -> client.load("O1", "Bearer other")).errorCode());
    }

    @Test void missingInternalTokenNeverCallsOrderConfirmation() {
        HttpOrderPaymentClient unconfigured = new HttpOrderPaymentClient("http://127.0.0.1:" + server.getAddress().getPort(), "");
        assertThrows(IllegalStateException.class, () -> unconfigured.confirm("O1", 5990));
        assertEquals(0, confirmations.get());
    }

    @Test void nonOkOrderEnvelopeCannotBeUsedAsPaymentSource() {
        assertEquals(ErrorCode.INTERNAL_ERROR, assertThrows(BusinessException.class,
                () -> client.load("BAD", "Bearer buyer-a")).errorCode());
    }
}

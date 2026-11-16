package com.agritainmen.gateway;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.cloud.gateway.route.Route;
import org.springframework.cloud.gateway.route.RouteLocator;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@Tag("api-audit")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"spring.cloud.nacos.discovery.enabled=false", "spring.cloud.nacos.config.enabled=false"})
class GatewayRouteAuditTest {
    @Autowired RouteLocator routes;

    @Test
    void orderAndSettlementPathsResolveToTheirServices() {
        List<Route> loaded = routes.getRoutes().collectList().block(Duration.ofSeconds(10));
        assertNotNull(loaded);
        matches(loaded, "order-service", "/api/v1/orders/O1");
        matches(loaded, "order-service", "/api/v1/after-sales");
        matches(loaded, "order-service", "/api/v1/after-sales/A1");
        matches(loaded, "settlement-service", "/api/v1/commissions");
        matches(loaded, "settlement-service", "/api/v1/commissions/rules");
        matches(loaded, "settlement-service", "/api/v1/withdrawals");
        matches(loaded, "settlement-service", "/api/v1/withdrawals/W1");
        matches(loaded, "settlement-service", "/api/v1/settlements/S1");
    }

    private void matches(List<Route> loaded, String service, String path) {
        var request = MockServerWebExchange.from(MockServerHttpRequest.get(path));
        assertTrue(loaded.stream().anyMatch(route -> service.equals(route.getId())
                        && Boolean.TRUE.equals(Mono.from(route.getPredicate().apply(request)).block(Duration.ofSeconds(2)))),
                () -> service + " 未匹配 " + path);
    }
}

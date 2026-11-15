package com.agritainmen.order.web;

import com.agritainmen.common.core.ApiResponse;
import com.agritainmen.common.core.BusinessException;
import com.agritainmen.common.core.ErrorCode;
import com.agritainmen.order.service.OrderService;
import com.agritainmen.order.web.OrderDtos.OrderView;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.databind.JsonNode;

@RestController
public class OrderFulfillmentSourceController {
    private final OrderService orderService;
    private final RestClient auth;

    public OrderFulfillmentSourceController(OrderService orderService,
            @Value("${agritainmen.clients.auth.base-url:http://127.0.0.1:8081}") String authBaseUrl) {
        this.orderService = orderService;
        this.auth = RestClient.builder().baseUrl(authBaseUrl).build();
    }

    @GetMapping("/api/v1/orders/{id}/fulfillment-source")
    public ApiResponse<OrderView> find(@PathVariable String id,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        if (authorization == null || !authorization.startsWith("Bearer "))
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        try {
            JsonNode envelope = auth.get().uri("/api/v1/auth/me")
                    .header(HttpHeaders.AUTHORIZATION, authorization).retrieve().body(JsonNode.class);
            if (envelope == null || !"OK".equals(envelope.path("code").asText()))
                throw new BusinessException(ErrorCode.UNAUTHORIZED);
            JsonNode profile = envelope.path("data");
            if (!"admin".equals(profile.path("actorType").asText())
                    || !"PLATFORM".equals(profile.path("tenantId").asText()))
                throw new BusinessException(ErrorCode.FORBIDDEN);
        } catch (BusinessException exception) {
            throw exception;
        } catch (RestClientResponseException exception) {
            if (exception.getStatusCode().is4xxClientError()) throw new BusinessException(ErrorCode.UNAUTHORIZED);
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "账号服务暂不可用");
        } catch (Exception exception) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "账号服务暂不可用");
        }
        return ApiResponse.ok(orderService.find(id));
    }
}

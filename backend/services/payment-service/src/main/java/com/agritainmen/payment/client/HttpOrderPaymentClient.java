package com.agritainmen.payment.client;

import com.agritainmen.common.core.ApiResponse;
import com.agritainmen.common.core.BusinessException;
import com.agritainmen.common.core.ErrorCode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.time.Duration;
import java.util.Map;

@Component
public class HttpOrderPaymentClient implements OrderPaymentClient {
    private final RestClient orders;
    private final String internalToken;

    public HttpOrderPaymentClient(@Value("${agritainmen.clients.order.base-url:http://127.0.0.1:8085}") String baseUrl,
            @Value("${agritainmen.security.payment.internal-token:}") String internalToken) {
        SimpleClientHttpRequestFactory requests = new SimpleClientHttpRequestFactory();
        requests.setConnectTimeout(Duration.ofSeconds(2));
        requests.setReadTimeout(Duration.ofSeconds(5));
        this.orders = RestClient.builder().baseUrl(baseUrl).requestFactory(requests).build();
        this.internalToken = internalToken;
    }

    @Override
    public OrderSnapshot load(String orderId, String authorization) {
        if (authorization == null || !authorization.startsWith("Bearer "))
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        try {
            ApiResponse<OrderSnapshot> response = orders.get().uri("/api/v1/orders/{id}", orderId)
                    .header(HttpHeaders.AUTHORIZATION, authorization)
                    .retrieve().body(new ParameterizedTypeReference<>() {});
            OrderSnapshot order = response == null ? null : response.data();
            if (response == null || !"OK".equals(response.code()) || order == null
                    || !orderId.equals(order.id()) || order.amountCents() <= 0 || order.status() == null)
                throw new BusinessException(ErrorCode.INTERNAL_ERROR, "订单服务返回无效数据");
            return order;
        } catch (BusinessException exception) {
            throw exception;
        } catch (RestClientResponseException exception) {
            if (exception.getStatusCode().value() == 401) throw new BusinessException(ErrorCode.UNAUTHORIZED);
            if (exception.getStatusCode().value() == 403) throw new BusinessException(ErrorCode.FORBIDDEN);
            if (exception.getStatusCode().value() == 404) throw new BusinessException(ErrorCode.NOT_FOUND, "订单不存在");
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "订单服务暂不可用");
        } catch (Exception exception) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "订单服务暂不可用");
        }
    }

    @Override
    public String confirm(String orderId, long amountCents) {
        if (internalToken == null || internalToken.isBlank())
            throw new IllegalStateException("订单支付内部令牌未配置");
        ApiResponse<OrderSnapshot> response = orders.post().uri("/api/v1/orders/{id}/payment-confirmation", orderId)
                .header("X-Order-Payment-Token", internalToken)
                .body(Map.of("amountCents", amountCents))
                .retrieve().body(new ParameterizedTypeReference<>() {});
        OrderSnapshot order = response == null ? null : response.data();
        if (response == null || !"OK".equals(response.code()) || order == null
                || !orderId.equals(order.id()) || order.amountCents() != amountCents || order.status() == null)
            throw new IllegalStateException("订单服务返回无效支付结果");
        return order.status();
    }
}

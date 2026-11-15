package com.agritainmen.fulfillment.client;

import com.agritainmen.common.core.BusinessException;
import com.agritainmen.common.core.ErrorCode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.databind.JsonNode;

@Component
public class OrderSourceClient {
    private final RestClient orders;

    public record Source(String buyerId, String receiver, String receiverPhone, String address) {}

    public OrderSourceClient(@Value("${agritainmen.clients.order.base-url:http://127.0.0.1:8085}") String baseUrl) {
        this.orders = RestClient.builder().baseUrl(baseUrl).build();
    }

    public Source load(String orderId, String supplierId, String authorization) {
        try {
            JsonNode envelope = orders.get().uri("/api/v1/orders/{id}/fulfillment-source", orderId)
                    .header(HttpHeaders.AUTHORIZATION, authorization).retrieve().body(JsonNode.class);
            if (envelope == null || !"OK".equals(envelope.path("code").asText()))
                throw new BusinessException(ErrorCode.INTERNAL_ERROR, "订单服务返回无效数据");
            JsonNode data = envelope.path("data");
            if (!orderId.equals(data.path("id").asText()) || data.path("buyerId").asText().isBlank()
                    || data.path("receiver").asText().isBlank() || data.path("receiverPhone").asText().isBlank()
                    || data.path("address").asText().isBlank() || !data.path("items").isArray())
                throw new BusinessException(ErrorCode.INTERNAL_ERROR, "订单服务返回无效数据");
            boolean owned = false;
            boolean otherSupplier = false;
            for (JsonNode item : data.path("items")) {
                if (supplierId.equals(item.path("supplierId").asText())) owned = true;
                else otherSupplier = true;
            }
            if (!owned) throw new BusinessException(ErrorCode.FORBIDDEN, "订单不属于指定供应商");
            if (otherSupplier) throw new BusinessException(ErrorCode.CONFLICT, "跨供应商订单暂不支持整单履约");
            return new Source(data.path("buyerId").asText(), data.path("receiver").asText(),
                    data.path("receiverPhone").asText(), data.path("address").asText());
        } catch (BusinessException exception) {
            throw exception;
        } catch (RestClientResponseException exception) {
            if (exception.getStatusCode().value() == 404) throw new BusinessException(ErrorCode.NOT_FOUND, "订单不存在");
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "订单服务暂不可用");
        } catch (Exception exception) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "订单服务暂不可用");
        }
    }
}

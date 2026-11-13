package com.agritainmen.order.client;

import com.agritainmen.common.core.ApiResponse;
import com.agritainmen.order.web.OrderDtos.PriceQuote;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.web.client.RestClient;

@Configuration
public class HttpServiceClients {
    @Bean
    @ConditionalOnMissingBean
    public CatalogClient catalogClient(@Value("${agritainmen.clients.catalog-base-url:http://catalog-service}") String baseUrl) {
        RestClient client = RestClient.builder().baseUrl(baseUrl).build();
        return skuId -> {
            ApiResponse<PriceQuote> response = client.get().uri("/api/v1/catalog/skus/{skuId}/quote", skuId)
                    .retrieve().body(new ParameterizedTypeReference<>() {});
            if (response == null || response.data() == null) throw new IllegalStateException("商品价格不存在: " + skuId);
            return response.data();
        };
    }

    @Bean
    @ConditionalOnMissingBean
    public InventoryClient inventoryClient(@Value("${agritainmen.clients.inventory-base-url:http://inventory-service}") String baseUrl) {
        RestClient client = RestClient.builder().baseUrl(baseUrl).build();
        return (orderId, lines, expiresAt) -> {
            ApiResponse<InventoryClient.Reservation> response = client.post().uri("/api/v1/inventory/reservations")
                    .header("Idempotency-Key", orderId)
                    .body(new InventoryClient.ReservePayload(orderId, lines, expiresAt))
                    .retrieve().body(new ParameterizedTypeReference<>() {});
            if (response == null || response.data() == null) throw new IllegalStateException("库存预占失败");
            return response.data();
        };
    }
}

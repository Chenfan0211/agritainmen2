package com.agritainmen.order.client;

import com.agritainmen.common.core.ApiResponse;
import com.agritainmen.order.web.OrderDtos.PriceQuote;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.time.Duration;

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
        SimpleClientHttpRequestFactory requests = new SimpleClientHttpRequestFactory();
        requests.setConnectTimeout(Duration.ofSeconds(2));
        requests.setReadTimeout(Duration.ofSeconds(5));
        RestClient client = RestClient.builder().baseUrl(baseUrl).requestFactory(requests).build();
        return new InventoryClient() {
            @Override
            public Reservation reserve(String orderId, java.util.List<Line> lines, java.time.Instant expiresAt) {
                ApiResponse<Reservation> response = client.post().uri("/api/v1/inventory/reservations")
                        .header("Idempotency-Key", orderId)
                        .body(new ReservePayload(orderId, lines, expiresAt))
                        .retrieve().body(new ParameterizedTypeReference<>() {});
                if (response == null || response.data() == null) throw new IllegalStateException("库存预占失败");
                return response.data();
            }

            @Override
            public Reservation release(String reservationId) {
                ApiResponse<Reservation> response = client.post().uri("/api/v1/inventory/reservations/{id}/release", reservationId)
                        .retrieve().body(new ParameterizedTypeReference<>() {});
                if (response == null || response.data() == null) throw new IllegalStateException("库存释放失败");
                return response.data();
            }
        };
    }
}

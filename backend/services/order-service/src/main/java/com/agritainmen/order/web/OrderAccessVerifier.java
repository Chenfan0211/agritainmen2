package com.agritainmen.order.web;

import com.agritainmen.common.core.BusinessException;
import com.agritainmen.common.core.ErrorCode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.databind.JsonNode;

import java.time.Duration;

@Component
public class OrderAccessVerifier {
    private final RestClient auth;

    public OrderAccessVerifier(@Value("${agritainmen.clients.auth.base-url:http://127.0.0.1:8081}") String baseUrl) {
        SimpleClientHttpRequestFactory requests = new SimpleClientHttpRequestFactory();
        requests.setConnectTimeout(Duration.ofSeconds(2));
        requests.setReadTimeout(Duration.ofSeconds(3));
        this.auth = RestClient.builder().baseUrl(baseUrl).requestFactory(requests).build();
    }

    public record Identity(String actorType, String actorId, String farmId) {}

    public Identity verify(String authorization) {
        if (authorization == null || !authorization.startsWith("Bearer "))
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        JsonNode response;
        try {
            response = auth.get().uri("/api/v1/auth/me")
                    .header(HttpHeaders.AUTHORIZATION, authorization).retrieve().body(JsonNode.class);
        } catch (RestClientResponseException error) {
            if (error.getStatusCode().is4xxClientError()) throw new BusinessException(ErrorCode.UNAUTHORIZED);
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "账号服务暂不可用");
        } catch (Exception error) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "账号服务暂不可用");
        }
        if (response == null || !"OK".equals(response.path("code").asText()))
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        JsonNode profile = response.path("data");
        String type = profile.path("actorType").asText();
        String id = profile.path("actorId").asText();
        if (!"PLATFORM".equals(profile.path("tenantId").asText()) || id.isBlank())
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        return new Identity(type, id, profile.path("farmId").asText());
    }

    public void requireBuyer(String authorization, String buyerId) {
        Identity identity = verify(authorization);
        if ("admin".equals(identity.actorType())) return;
        if ("store".equals(identity.actorType()) && !identity.farmId().isBlank() && identity.farmId().equals(buyerId)) return;
        if (!"user".equals(identity.actorType()) || !identity.actorId().equals(buyerId))
            throw new BusinessException(ErrorCode.FORBIDDEN);
    }

    public void requireAdmin(String authorization) {
        if (!"admin".equals(verify(authorization).actorType()))
            throw new BusinessException(ErrorCode.FORBIDDEN);
    }

    public String visibleBuyer(String authorization, String requestedBuyerId) {
        Identity identity = verify(authorization);
        if ("admin".equals(identity.actorType())) return requestedBuyerId;
        if ("user".equals(identity.actorType())) return identity.actorId();
        if ("store".equals(identity.actorType()) && !identity.farmId().isBlank()) return identity.farmId();
        throw new BusinessException(ErrorCode.FORBIDDEN);
    }

    public void requireReadable(Identity identity, String buyerId) {
        if ("admin".equals(identity.actorType())) return;
        if ("store".equals(identity.actorType()) && !identity.farmId().isBlank() && identity.farmId().equals(buyerId)) return;
        if (!"user".equals(identity.actorType()) || !identity.actorId().equals(buyerId))
            throw new BusinessException(ErrorCode.NOT_FOUND, "订单不存在");
    }
}

package com.agritainmen.fulfillment.web;

import com.agritainmen.common.core.BusinessException;
import com.agritainmen.common.core.ErrorCode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.databind.JsonNode;

@Component
public class FulfillmentAccessVerifier {
    private final RestClient auth;

    public record Identity(String actorType, String supplierId, String driverId) {}

    public FulfillmentAccessVerifier(@Value("${agritainmen.clients.auth.base-url:http://127.0.0.1:8081}") String baseUrl) {
        this.auth = RestClient.builder().baseUrl(baseUrl).build();
    }

    public Identity verify(String authorization) {
        if (authorization == null || !authorization.startsWith("Bearer ")) throw new BusinessException(ErrorCode.UNAUTHORIZED);
        try {
            JsonNode envelope = auth.get().uri("/api/v1/auth/me")
                    .header(HttpHeaders.AUTHORIZATION, authorization).retrieve().body(JsonNode.class);
            if (envelope == null || !"OK".equals(envelope.path("code").asText())) throw new BusinessException(ErrorCode.UNAUTHORIZED);
            JsonNode profile = envelope.path("data");
            if (!"PLATFORM".equals(profile.path("tenantId").asText())) throw new BusinessException(ErrorCode.FORBIDDEN);
            String actorType = profile.path("actorType").asText();
            String supplierId = profile.path("supplierId").asText("");
            String driverId = profile.path("driverId").asText("");
            if (("supplier".equals(actorType) || "driver".equals(actorType)) && supplierId.isBlank())
                throw new BusinessException(ErrorCode.UNAUTHORIZED);
            if ("driver".equals(actorType) && driverId.isBlank()) throw new BusinessException(ErrorCode.UNAUTHORIZED);
            return new Identity(actorType, supplierId, driverId);
        } catch (BusinessException exception) {
            throw exception;
        } catch (RestClientResponseException exception) {
            if (exception.getStatusCode().is4xxClientError()) throw new BusinessException(ErrorCode.UNAUTHORIZED);
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "账号服务暂不可用");
        } catch (Exception exception) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "账号服务暂不可用");
        }
    }

    public void requireActiveDriver(String authorization, String driverId) {
        if (driverId == null || driverId.isBlank()) throw new BusinessException(ErrorCode.BAD_REQUEST, "司机配送必须指定司机");
        try {
            JsonNode envelope = auth.get().uri("/api/v1/auth/supplier/drivers")
                    .header(HttpHeaders.AUTHORIZATION, authorization).retrieve().body(JsonNode.class);
            if (envelope == null || !"OK".equals(envelope.path("code").asText()))
                throw new BusinessException(ErrorCode.UNAUTHORIZED);
            for (JsonNode driver : envelope.path("data")) {
                if (driverId.equals(driver.path("id").asText()) && driver.path("enabled").asBoolean()) return;
            }
            throw new BusinessException(ErrorCode.FORBIDDEN, "司机不属于当前供应商或已停用");
        } catch (BusinessException exception) {
            throw exception;
        } catch (RestClientResponseException exception) {
            if (exception.getStatusCode().is4xxClientError()) throw new BusinessException(ErrorCode.UNAUTHORIZED);
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "账号服务暂不可用");
        } catch (Exception exception) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "账号服务暂不可用");
        }
    }
}

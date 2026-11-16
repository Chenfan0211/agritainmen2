package com.agritainmen.common.web;

import com.agritainmen.common.core.BusinessException;
import com.agritainmen.common.core.ErrorCode;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.databind.JsonNode;

import java.time.Duration;

public final class RemoteAdminVerifier {
    private final RestClient auth;

    public RemoteAdminVerifier(String baseUrl) {
        SimpleClientHttpRequestFactory requests = new SimpleClientHttpRequestFactory();
        requests.setConnectTimeout(Duration.ofSeconds(2));
        requests.setReadTimeout(Duration.ofSeconds(3));
        this.auth = RestClient.builder().baseUrl(baseUrl).requestFactory(requests).build();
    }

    public void requireAdmin(String authorization) {
        if (authorization == null || !authorization.startsWith("Bearer "))
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        JsonNode envelope;
        try {
            envelope = auth.get().uri("/api/v1/auth/me")
                    .header(HttpHeaders.AUTHORIZATION, authorization).retrieve().body(JsonNode.class);
        } catch (RestClientResponseException exception) {
            if (exception.getStatusCode().is4xxClientError()) throw new BusinessException(ErrorCode.UNAUTHORIZED);
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "账号服务暂不可用");
        } catch (Exception exception) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "账号服务暂不可用");
        }
        if (envelope == null || !"OK".equals(envelope.path("code").asText()))
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        JsonNode profile = envelope.path("data");
        if (!"PLATFORM".equals(profile.path("tenantId").asText()) || profile.path("actorId").asText().isBlank())
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        if (!"admin".equals(profile.path("actorType").asText()))
            throw new BusinessException(ErrorCode.FORBIDDEN);
    }
}

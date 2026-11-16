package com.agritainmen.settlement.web;

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
import java.util.Arrays;
import java.util.List;

@Component
public class SettlementAccessVerifier {
    private final RestClient auth;

    public SettlementAccessVerifier(@Value("${agritainmen.clients.auth.base-url:http://127.0.0.1:8081}") String baseUrl) {
        SimpleClientHttpRequestFactory requests = new SimpleClientHttpRequestFactory();
        requests.setConnectTimeout(Duration.ofSeconds(2));
        requests.setReadTimeout(Duration.ofSeconds(3));
        auth = RestClient.builder().baseUrl(baseUrl).requestFactory(requests).build();
    }

    public record Identity(String actorType, String actorId, String tenantId, String level, String leaderId,
                           List<String> permissions) {}

    public Identity verify(String authorization) {
        if (authorization == null || !authorization.startsWith("Bearer "))
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        JsonNode envelope;
        try {
            envelope = auth.get().uri("/api/v1/auth/me")
                    .header(HttpHeaders.AUTHORIZATION, authorization).retrieve().body(JsonNode.class);
        } catch (RestClientResponseException error) {
            if (error.getStatusCode().is4xxClientError()) throw new BusinessException(ErrorCode.UNAUTHORIZED);
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "账号服务暂不可用");
        } catch (Exception error) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "账号服务暂不可用");
        }
        if (envelope == null || !"OK".equals(envelope.path("code").asText()))
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        JsonNode profile = envelope.path("data");
        String actorId = profile.path("actorId").asText();
        String actorType = profile.path("actorType").asText();
        String tenantId = profile.path("tenantId").asText();
        if (actorId.isBlank() || actorType.isBlank() || tenantId.isBlank())
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        List<String> permissions = profile.path("permissions").isArray()
                ? profile.path("permissions").valueStream().map(JsonNode::asText).toList() : List.of();
        return new Identity(actorType, actorId, tenantId, profile.path("level").asText(),
                profile.path("leaderId").asText(), permissions);
    }

    public Identity requireAdmin(String authorization, String... permissions) {
        Identity identity = verify(authorization);
        if (!"PLATFORM".equals(identity.tenantId()) || !"admin".equals(identity.actorType())
                || !(identity.permissions().contains("*")
                || Arrays.stream(permissions).anyMatch(identity.permissions()::contains)))
            throw new BusinessException(ErrorCode.FORBIDDEN);
        return identity;
    }

    public void requireBeneficiary(String authorization, String beneficiaryId) {
        Identity identity = verify(authorization);
        if (!"PLATFORM".equals(identity.tenantId())) throw new BusinessException(ErrorCode.FORBIDDEN);
        if ("admin".equals(identity.actorType()) && (identity.permissions().contains("*")
                || identity.permissions().contains("commission.manage"))) return;
        if ("user".equals(identity.actorType())
                && ("level1".equals(identity.level()) || "level2".equals(identity.level()))
                && !identity.leaderId().isBlank() && identity.leaderId().equals(beneficiaryId)) return;
        throw new BusinessException(ErrorCode.FORBIDDEN);
    }
}

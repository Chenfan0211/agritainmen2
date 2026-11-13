package com.agritainmen.org.web;

import com.agritainmen.common.core.ApiResponse;
import com.agritainmen.common.core.BusinessException;
import com.agritainmen.common.core.ErrorCode;
import com.agritainmen.org.service.OrgProfiles;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.databind.JsonNode;

import java.util.Map;

@RestController
public class OrgSupplierSelfController {
    private final OrgProfiles profiles;
    private final RestClient auth;

    public OrgSupplierSelfController(OrgProfiles profiles,
            @Value("${agritainmen.clients.auth.base-url:http://127.0.0.1:8081}") String authBaseUrl) {
        this.profiles = profiles;
        this.auth = RestClient.builder().baseUrl(authBaseUrl).build();
    }

    @GetMapping("/api/v1/org/me/supplier")
    public ApiResponse<Map<String, Object>> supplier(@RequestHeader(value = "Authorization", required = false) String authorization) {
        if (authorization == null || !authorization.startsWith("Bearer ")) throw new BusinessException(ErrorCode.UNAUTHORIZED);
        try {
            JsonNode response = auth.get().uri("/api/v1/auth/me")
                    .header(HttpHeaders.AUTHORIZATION, authorization).retrieve().body(JsonNode.class);
            if (response == null || !"OK".equals(response.path("code").asText())) throw new BusinessException(ErrorCode.UNAUTHORIZED);
            JsonNode actor = response.path("data");
            String actorType = actor.path("actorType").asText();
            String supplierId = actor.path("supplierId").asText();
            if ((!"supplier".equals(actorType) && !"driver".equals(actorType)) || supplierId.isBlank()
                    || !"PLATFORM".equals(actor.path("tenantId").asText()))
                throw new BusinessException(ErrorCode.FORBIDDEN);
            return ApiResponse.ok(profiles.supplier(supplierId));
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

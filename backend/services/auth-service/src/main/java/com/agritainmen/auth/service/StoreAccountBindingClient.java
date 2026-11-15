package com.agritainmen.auth.service;

import com.agritainmen.auth.persistence.AuthAccount;
import com.agritainmen.common.core.BusinessException;
import com.agritainmen.common.core.ErrorCode;
import com.agritainmen.common.security.JwtService;
import com.agritainmen.common.security.TokenClaims;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.databind.JsonNode;

import java.time.Duration;
import java.util.List;

@Component
public class StoreAccountBindingClient {
    private final RestClient org;
    private final JwtService jwt;

    public StoreAccountBindingClient(@Value("${agritainmen.clients.org.base-url:http://127.0.0.1:8082}") String baseUrl,
                                     JwtService jwt) {
        SimpleClientHttpRequestFactory requests = new SimpleClientHttpRequestFactory();
        requests.setConnectTimeout(Duration.ofSeconds(2));
        requests.setReadTimeout(Duration.ofSeconds(3));
        this.org = RestClient.builder().baseUrl(baseUrl).requestFactory(requests).build();
        this.jwt = jwt;
    }

    public record Binding(String id, String farmId, String account, String role, String priceLevel, boolean enabled) {}
    public record StoreFarm(String farmId, String name, String contact, String contactPhone, String address, String priceLevel) {}

    public Binding load(String storeAccountId, String authorization) {
        JsonNode envelope;
        try {
            envelope = org.get().uri("/api/v1/org/farm-accounts/{id}", storeAccountId)
                    .header(HttpHeaders.AUTHORIZATION, authorization).retrieve().body(JsonNode.class);
        } catch (RestClientResponseException error) {
            if (error.getStatusCode().value() == 404) throw new BusinessException(ErrorCode.NOT_FOUND, "门店账号不存在");
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "门店账号资料暂不可用");
        } catch (Exception error) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "门店账号资料暂不可用");
        }
        if (envelope == null || !"OK".equals(envelope.path("code").asText()))
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "门店账号资料响应无效");
        JsonNode data = envelope.path("data");
        String id = data.path("id").asText();
        String farmId = data.path("farm_id").asText();
        String account = data.path("account").asText();
        String role = data.path("role").asText();
        if (!storeAccountId.equals(id) || farmId.isBlank() || account.isBlank()
                || (!"owner".equals(role) && !"staff".equals(role)))
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "门店账号资料响应无效");
        String priceLevel = data.path("price_level").isNull() ? null : data.path("price_level").asText(null);
        return new Binding(id, farmId, account, role, priceLevel, data.path("enabled").asBoolean(false));
    }

    public StoreFarm farm(Binding binding) {
        JsonNode envelope;
        try {
            envelope = org.get().uri("/api/v1/org/farms/{id}", binding.farmId())
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + serviceToken("farm.inspect"))
                    .retrieve().body(JsonNode.class);
        } catch (RestClientResponseException error) {
            if (error.getStatusCode().value() == 404) throw new BusinessException(ErrorCode.UNAUTHORIZED, "所属门店已失效");
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "门店资料暂不可用");
        } catch (Exception error) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "门店资料暂不可用");
        }
        if (envelope == null || !"OK".equals(envelope.path("code").asText()))
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "门店资料响应无效");
        JsonNode data = envelope.path("data");
        String id = data.path("id").asText();
        String name = data.path("name").asText();
        if (!binding.farmId().equals(id) || name.isBlank())
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "门店资料响应无效");
        return new StoreFarm(id, name, data.path("contact").asText(""), data.path("contactPhone").asText(""),
                data.path("profile").path("address").asText(""), "staff".equals(binding.role()) ? binding.priceLevel() : null);
    }

    public Binding requireActive(AuthAccount account) {
        if (account == null || !"store".equals(account.getActorType()) || !Boolean.TRUE.equals(account.getEnabled())
                || account.getStoreAccountId() == null || account.getFarmId() == null)
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "门店账号已失效");
        String token = serviceToken("farm-account.inspect");
        Binding binding;
        try {
            binding = load(account.getStoreAccountId(), "Bearer " + token);
        } catch (BusinessException error) {
            if (error.errorCode() == ErrorCode.NOT_FOUND) throw new BusinessException(ErrorCode.UNAUTHORIZED, "门店账号已失效");
            throw error;
        }
        if (!binding.enabled() || !account.getFarmId().equals(binding.farmId())
                || !account.getAccount().equals(binding.account()))
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "门店账号已失效");
        return binding;
    }

    private String serviceToken(String permission) {
        return jwt.createAccessToken(new TokenClaims("auth-service", "service", "auth-service", "PLATFORM",
                List.of("service"), List.of(permission)));
    }
}

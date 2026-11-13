package com.agritainmen.auth.service;

import com.agritainmen.common.core.BusinessException;
import com.agritainmen.common.core.ErrorCode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.databind.JsonNode;

import java.time.Duration;

@Component
public class SupplierApprovalVerifier {
    private final RestClient org;

    public SupplierApprovalVerifier(@Value("${agritainmen.clients.org.base-url:http://127.0.0.1:8082}") String baseUrl) {
        SimpleClientHttpRequestFactory requests = new SimpleClientHttpRequestFactory();
        requests.setConnectTimeout(Duration.ofSeconds(2));
        requests.setReadTimeout(Duration.ofSeconds(3));
        this.org = RestClient.builder().baseUrl(baseUrl).requestFactory(requests).build();
    }

    public void requireApproved(String supplierId, String authorization) {
        JsonNode response;
        try {
            response = org.get().uri("/api/v1/org/suppliers/{id}", supplierId)
                    .header(HttpHeaders.AUTHORIZATION, authorization)
                    .retrieve().body(JsonNode.class);
        } catch (RestClientResponseException error) {
            if (error.getStatusCode().value() == 404)
                throw new BusinessException(ErrorCode.NOT_FOUND, "供应商不存在");
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "暂时无法核验供应商审核状态，请稍后重试");
        } catch (RestClientException error) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "暂时无法核验供应商审核状态，请稍后重试");
        }
        if (response == null || !"OK".equals(response.path("code").asText())
                || !supplierId.equals(response.path("data").path("id").asText()))
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "供应商审核状态响应无效，请稍后重试");
        JsonNode supplier = response.path("data");
        if (!supplier.path("certified").asBoolean(false) || !"cooperating".equals(supplier.path("status").asText()))
            throw new BusinessException(ErrorCode.CONFLICT, "供应商尚未通过审核或已暂停合作");
    }
}

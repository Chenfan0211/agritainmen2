package com.agritainmen.org.web;

import com.agritainmen.common.core.ApiResponse;
import com.agritainmen.common.core.BusinessException;
import com.agritainmen.common.core.ErrorCode;
import com.agritainmen.org.service.OrgProfiles;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.databind.JsonNode;

import java.util.Map;
import java.util.LinkedHashMap;

@RestController
public class OrgSupplierSelfController {
    private final OrgProfiles profiles;
    private final RestClient auth;

    public OrgSupplierSelfController(OrgProfiles profiles,
            @Value("${agritainmen.clients.auth.base-url:http://127.0.0.1:8081}") String authBaseUrl) {
        this.profiles = profiles;
        this.auth = RestClient.builder().baseUrl(authBaseUrl).build();
    }

    public record WarehouseRequest(@NotBlank String address, String contactName, String contactPhone,
            Double longitude, Double latitude, @NotNull @Min(0) Long expectedVersion) {}

    @GetMapping("/api/v1/org/me/supplier")
    public ApiResponse<Map<String, Object>> supplier(@RequestHeader(value = "Authorization", required = false) String authorization) {
        return ApiResponse.ok(profiles.supplier(supplierId(authorization, false)));
    }

    @PutMapping("/api/v1/org/me/supplier/warehouse")
    public ApiResponse<Map<String, Object>> updateWarehouse(@Valid @RequestBody WarehouseRequest request,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        String supplierId = supplierId(authorization, true);
        String address = request.address().trim();
        if (address.isBlank() || address.length() > 500) throw new BusinessException(ErrorCode.BAD_REQUEST, "仓点地址须为500字以内");
        String contactName = request.contactName() == null ? "" : request.contactName().trim();
        String contactPhone = request.contactPhone() == null ? "" : request.contactPhone().trim();
        if (contactName.length() > 100 || (!contactPhone.isBlank() && !contactPhone.matches("1[3-9]\\d{9}")))
            throw new BusinessException(ErrorCode.BAD_REQUEST, "仓点联系人或手机号无效");
        boolean hasLongitude = request.longitude() != null;
        if (hasLongitude != (request.latitude() != null)
                || (hasLongitude && (!validCoordinate(request.longitude(), -180, 180) || !validCoordinate(request.latitude(), -90, 90))))
            throw new BusinessException(ErrorCode.BAD_REQUEST, "仓点坐标无效");
        Map<String, Object> warehouse = new LinkedHashMap<>();
        warehouse.put("address", address);
        warehouse.put("contactName", contactName);
        warehouse.put("contactPhone", contactPhone);
        if (hasLongitude) {
            warehouse.put("longitude", request.longitude());
            warehouse.put("latitude", request.latitude());
        }
        warehouse.put("coordinateSystem", "GCJ-02");
        return ApiResponse.ok(profiles.updateSupplierWarehouse(supplierId, request.expectedVersion(), warehouse));
    }

    private boolean validCoordinate(double value, double min, double max) {
        return Double.isFinite(value) && value >= min && value <= max;
    }

    private String supplierId(String authorization, boolean supplierOnly) {
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
            if (supplierOnly && !"supplier".equals(actorType)) throw new BusinessException(ErrorCode.FORBIDDEN);
            return supplierId;
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

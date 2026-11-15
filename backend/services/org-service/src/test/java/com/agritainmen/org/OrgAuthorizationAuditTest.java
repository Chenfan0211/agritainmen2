package com.agritainmen.org;

import com.agritainmen.common.security.JwtService;
import com.agritainmen.common.security.TokenClaims;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

@Tag("api-audit")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"spring.profiles.active=test", "agritainmen.demo.seed-enabled=false"})
class OrgAuthorizationAuditTest {
    @LocalServerPort int port;
    @Autowired JwtService jwt;
    @Autowired JdbcTemplate jdbc;

    @Test
    void directRequestsCannotUseActorHeadersOrMissingBearer() {
        assertEquals(401, status(HttpMethod.GET, "/api/v1/org/suppliers", null, true));
        assertEquals(401, status(HttpMethod.GET, "/api/v1/org/farms", null, true));
        assertEquals(401, status(HttpMethod.GET, "/api/v1/org/media/M1", null, true));
    }

    @Test
    void signedPlatformAdminCanReadOnlyItsPermittedDomain() {
        String supplier = token("admin", "PLATFORM", List.of("supplier.audit"));
        assertEquals(200, status(HttpMethod.GET, "/api/v1/org/suppliers", supplier, false));
        assertEquals(403, status(HttpMethod.GET, "/api/v1/org/farms", supplier, false));
        assertEquals(403, status(HttpMethod.POST, "/api/v1/org/suppliers", supplier, false));
        assertEquals(403, status(HttpMethod.POST, "/api/v1/org/media", supplier, false));
        assertEquals(403, status(HttpMethod.PUT, "/api/v1/org/suppliers/S1/account",
                token("admin", "PLATFORM", List.of("supplier.account.update")), false));
        assertEquals(200, status(HttpMethod.GET, "/api/v1/org/farms", token("admin", "PLATFORM", List.of("farm.manage")), false));
    }

    @Test
    void signedNonPlatformOrNonAdminCannotAccessOrgAdminRoutes() {
        assertEquals(403, status(HttpMethod.GET, "/api/v1/org/suppliers", token("supplier", "PLATFORM", List.of("*")), true));
        assertEquals(403, status(HttpMethod.GET, "/api/v1/org/drivers", token("supplier", "PLATFORM", List.of("*")), true));
        assertEquals(403, status(HttpMethod.POST, "/api/v1/org/farm-accounts", token("supplier", "PLATFORM", List.of("*")), false));
        assertEquals(403, status(HttpMethod.GET, "/api/v1/org/farm-accounts/MISSING", token("store", "PLATFORM", List.of("*")), false));
        assertEquals(403, status(HttpMethod.GET, "/api/v1/org/suppliers", token("admin", "OTHER", List.of("*")), true));
        assertEquals(401, status(HttpMethod.GET, "/api/v1/org/suppliers", jwt.createRefreshToken(
                new TokenClaims("admin", "admin", "A1", "PLATFORM", List.of(), List.of("*"))), false));
    }

    @Test
    void mediaReadPermissionFollowsStoredPurpose() {
        jdbc.update("delete from org_media where id in ('SEC-SUPPLIER', 'SEC-FARM')");
        jdbc.update("insert into org_media(id,tenant_id,purpose,mime_type,content,size_bytes,created_at) values ('SEC-SUPPLIER','PLATFORM','supplier-business-license','image/png',?,1,current_timestamp)", new byte[]{1});
        jdbc.update("insert into org_media(id,tenant_id,purpose,mime_type,content,size_bytes,created_at) values ('SEC-FARM','PLATFORM','farm-cover','image/png',?,1,current_timestamp)", new byte[]{1});
        String farm = token("admin", "PLATFORM", List.of("farm.manage"));
        String supplier = token("admin", "PLATFORM", List.of("supplier.audit"));
        assertEquals(403, status(HttpMethod.GET, "/api/v1/org/media/SEC-SUPPLIER", farm, false));
        assertEquals(403, status(HttpMethod.GET, "/api/v1/org/media/SEC-FARM", supplier, false));
        assertEquals(200, status(HttpMethod.GET, "/api/v1/org/media/SEC-FARM", farm, false));
        assertEquals(200, status(HttpMethod.GET, "/api/v1/org/media/SEC-SUPPLIER", supplier, false));
    }

    @Test
    void mediaUploadPermissionFollowsBodyPurpose() {
        String farm = token("admin", "PLATFORM", List.of("farm.manage"));
        String supplier = token("admin", "PLATFORM", List.of("supplier.update"));
        Map<String, String> supplierImage = Map.of("purpose", "supplier-permit");
        Map<String, String> farmImage = Map.of("purpose", "farm-cover");
        assertEquals(403, status(HttpMethod.POST, "/api/v1/org/media", farm, supplierImage));
        assertEquals(403, status(HttpMethod.POST, "/api/v1/org/media", supplier, farmImage));
        assertEquals(400, status(HttpMethod.POST, "/api/v1/org/media", farm, farmImage));
        assertEquals(400, status(HttpMethod.POST, "/api/v1/org/media", supplier, supplierImage));
        String png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9RVK8AAAAASUVORK5CYII=";
        assertEquals(200, status(HttpMethod.POST, "/api/v1/org/media", farm,
                Map.of("purpose", "farm-cover", "mimeType", "image/png", "base64", png)));
        assertEquals(200, status(HttpMethod.POST, "/api/v1/org/media", supplier,
                Map.of("purpose", "supplier-permit", "mimeType", "image/png", "base64", png)));
    }

    private String token(String actorType, String tenantId, List<String> permissions) {
        return jwt.createAccessToken(new TokenClaims("A1", actorType, "A1", tenantId, List.of(), permissions));
    }

    private int status(HttpMethod method, String path, String token, boolean spoofHeaders) {
        return status(method, path, token, spoofHeaders, null);
    }

    private int status(HttpMethod method, String path, String token, Map<String, String> body) {
        return status(method, path, token, false, body);
    }

    private int status(HttpMethod method, String path, String token, boolean spoofHeaders, Map<String, String> body) {
        RestClient client = RestClient.builder().baseUrl("http://localhost:" + port).build();
        var request = client.method(method).uri(path).headers(headers -> {
            if (token != null) headers.set(HttpHeaders.AUTHORIZATION, "Bearer " + token);
            if (spoofHeaders) {
                headers.set("X-Actor-Type", "admin");
                headers.set("X-Actor-Id", "forged");
                headers.set("X-Tenant-Id", "PLATFORM");
            }
        });
        if (body != null) request.contentType(MediaType.APPLICATION_JSON).body(body);
        return request.exchange((outbound, response) -> response.getStatusCode().value());
    }
}

package com.agritainmen.org;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.databind.JsonNode;

import java.util.List;
import java.util.Map;
import java.util.Base64;

import static org.junit.jupiter.api.Assertions.*;

@Tag("api-audit")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"spring.profiles.active=test", "agritainmen.security.org.enabled=false"})
@Import(OrgWriteAuditTest.PermitAllApiAuditSecurity.class)
class OrgProfileAuditTest {
    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;

    @Test
    void supplierProfileSurvivesCreateUpdateAndList() {
        RestClient client = RestClient.builder().baseUrl("http://localhost:" + port).build();
        JsonNode created = client.post().uri("/api/v1/org/suppliers").contentType(MediaType.APPLICATION_JSON).body(Map.of(
                "name", "资料供应商", "region", "长沙", "category", "生鲜", "contactPhone", "13900000021",
                "profile", Map.of("coop", true, "brands", List.of("品牌甲"), "serviceRegions", List.of("长沙"),
                        "businessLicenseNumber", "BL21", "businessLicense", "https://example.com/license.jpg", "permitNumber", "PM21", "permit", "https://example.com/permit.jpg", "validUntil", "2030-12-31")
        )).retrieve().body(JsonNode.class);
        String id = created.path("data").path("id").asText();
        assertEquals("品牌甲", created.path("data").path("profile").path("brands").get(0).asText());
        JsonNode updated = client.put().uri("/api/v1/org/suppliers/" + id).contentType(MediaType.APPLICATION_JSON).body(Map.of(
                "name", "资料供应商新版", "region", "湘西", "category", "腊味", "contactPhone", "13900000021",
                "profile", Map.of("coop", false, "brands", List.of("品牌乙"), "serviceRegions", List.of("湘西"), "businessLicenseNumber", "BL22", "businessLicense", "https://example.com/new.jpg", "permitNumber", "PM21", "permit", "https://example.com/permit.jpg", "validUntil", "2031-01-01")
        )).retrieve().body(JsonNode.class);
        assertEquals("pending", updated.path("data").path("status").asText());
        assertEquals("品牌乙", updated.path("data").path("profile").path("brands").get(0).asText());
        JsonNode list = client.get().uri("/api/v1/org/suppliers").retrieve().body(JsonNode.class);
        assertTrue(list.path("data").toString().contains("资料供应商新版"));
        assertTrue(list.path("data").toString().contains("BL22"));
        JsonNode detail = client.get().uri("/api/v1/org/suppliers/" + id).retrieve().body(JsonNode.class);
        assertEquals("资料供应商新版", detail.path("data").path("name").asText());
        assertEquals("pending", detail.path("data").path("status").asText());
    }

    @Test
    void farmProfileSurvivesCreateUpdateAndList() {
        RestClient client = RestClient.builder().baseUrl("http://localhost:" + port).build();
        JsonNode created = client.post().uri("/api/v1/org/farms").contentType(MediaType.APPLICATION_JSON).body(Map.of(
                "name", "资料门店", "region", "吉首市", "contact", "王店长", "contactPhone", "13800000021", "status", "pending",
                "profile", Map.of("city", "湘西州", "districtCode", "433101", "detail", "矮寨镇1号", "address", "湖南省湘西州吉首市矮寨镇1号", "tags", List.of("新入驻"), "rating", 5, "averageSpend", 60, "image", "https://example.com/cover.jpg", "locationStatus", "failed")
        )).retrieve().body(JsonNode.class);
        String id = created.path("data").path("id").asText();
        assertEquals("王店长", created.path("data").path("contact").asText());
        JsonNode updated = client.put().uri("/api/v1/org/farms/" + id).contentType(MediaType.APPLICATION_JSON).body(Map.of(
                "name", "资料门店新版", "region", "吉首市", "contact", "李店长", "contactPhone", "13800000022", "status", "active",
                "profile", Map.of("city", "湘西州", "districtCode", "433101", "detail", "矮寨镇2号", "address", "湖南省湘西州吉首市矮寨镇2号", "tags", List.of("重点"), "rating", 4, "averageSpend", 55, "image", "https://example.com/cover2.jpg", "locationStatus", "failed")
        )).retrieve().body(JsonNode.class);
        assertEquals("李店长", updated.path("data").path("contact").asText());
        assertEquals("重点", updated.path("data").path("profile").path("tags").get(0).asText());
        JsonNode list = client.get().uri("/api/v1/org/farms").retrieve().body(JsonNode.class);
        assertTrue(list.path("data").toString().contains("资料门店新版"));
        assertTrue(list.path("data").toString().contains("cover2.jpg"));
    }

    @Test
    void supplierAuditUsesExplicitDecisionAndDuplicatePhoneIsRejected() {
        RestClient client = RestClient.builder().baseUrl("http://localhost:" + port).build();
        JsonNode created = client.post().uri("/api/v1/org/suppliers").contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("name", "审核供应商", "contactPhone", "13900000031")).retrieve().body(JsonNode.class);
        String id = created.path("data").path("id").asText();
        JsonNode rejected = client.post().uri("/api/v1/org/suppliers/" + id + "/audit").contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("approved", false)).retrieve().body(JsonNode.class);
        assertEquals("paused", rejected.path("data").path("status").asText());
        assertThrows(RestClientResponseException.class, () -> client.post().uri("/api/v1/org/suppliers")
                .contentType(MediaType.APPLICATION_JSON).body(Map.of("name", "重复供应商", "contactPhone", "13900000031")).retrieve().body(JsonNode.class));
    }

    @Test
    void rejectsFarmWithoutAddressAndUnknownProfileUpdate() {
        RestClient client = RestClient.builder().baseUrl("http://localhost:" + port).build();
        assertThrows(RestClientResponseException.class, () -> client.post().uri("/api/v1/org/farms")
                .contentType(MediaType.APPLICATION_JSON).body(Map.of("name", "无地址门店", "region", "吉首市"))
                .retrieve().body(JsonNode.class));
        assertThrows(RestClientResponseException.class, () -> client.put().uri("/api/v1/org/suppliers/UNKNOWN")
                .contentType(MediaType.APPLICATION_JSON).body(Map.of("name", "不存在", "contactPhone", "13900000032"))
                .retrieve().body(JsonNode.class));
    }

    @Test
    void pausedApprovedSupplierRemainsCertifiedAfterReload() {
        RestClient client = RestClient.builder().baseUrl("http://localhost:" + port).build();
        JsonNode created = client.post().uri("/api/v1/org/suppliers").contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("name", "已认证供应商", "contactPhone", "13900000041")).retrieve().body(JsonNode.class);
        String id = created.path("data").path("id").asText();
        client.post().uri("/api/v1/org/suppliers/" + id + "/audit").contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("approved", true)).retrieve().body(JsonNode.class);
        JsonNode paused = client.post().uri("/api/v1/org/suppliers/" + id + "/pause")
                .contentType(MediaType.APPLICATION_JSON).body(Map.of("reason", "暂停合作"))
                .retrieve().body(JsonNode.class);
        assertEquals("paused", paused.path("data").path("status").asText());
        assertTrue(paused.path("data").path("certified").asBoolean());
    }

    @Test
    void pauseReasonSurvivesReloadAndClearsOnResume() {
        RestClient client = RestClient.builder().baseUrl("http://localhost:" + port).build();
        JsonNode created = client.post().uri("/api/v1/org/suppliers").contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("name", "暂停原因供应商", "contactPhone", "13900000071")).retrieve().body(JsonNode.class);
        String id = created.path("data").path("id").asText();
        client.post().uri("/api/v1/org/suppliers/" + id + "/audit")
                .contentType(MediaType.APPLICATION_JSON).body(Map.of("approved", true))
                .retrieve().body(JsonNode.class);
        assertEquals(400, assertThrows(RestClientResponseException.class, () -> client.post()
                .uri("/api/v1/org/suppliers/" + id + "/pause").contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("reason", " ")).retrieve().body(JsonNode.class)).getStatusCode().value());
        JsonNode paused = client.post().uri("/api/v1/org/suppliers/" + id + "/pause")
                .contentType(MediaType.APPLICATION_JSON).body(Map.of("reason", "资质复核"))
                .retrieve().body(JsonNode.class);
        assertEquals("资质复核", paused.path("data").path("cooperationPauseReason").asText());
        assertEquals("资质复核", client.get().uri("/api/v1/org/suppliers/" + id)
                .retrieve().body(JsonNode.class).path("data").path("cooperationPauseReason").asText());
        assertTrue(client.get().uri("/api/v1/org/suppliers").retrieve().body(JsonNode.class)
                .path("data").toString().contains("资质复核"));
        JsonNode restored = client.post().uri("/api/v1/org/suppliers/" + id + "/resume")
                .retrieve().body(JsonNode.class);
        assertTrue(restored.path("data").path("cooperationPauseReason").isNull());
        client.post().uri("/api/v1/org/suppliers/" + id + "/pause")
                .contentType(MediaType.APPLICATION_JSON).body(Map.of("reason", "再次复核"))
                .retrieve().body(JsonNode.class);
        JsonNode resumed = client.post().uri("/api/v1/org/suppliers/" + id + "/resume")
                .retrieve().body(JsonNode.class);
        assertTrue(resumed.path("data").path("cooperationPauseReason").isNull());
    }

    @Test
    void tenantRowsStayOutsidePlatformListsAndUpdates() {
        jdbc.update("insert into org_supplier(id,tenant_id,name,contact_phone,status,certified,created_at,updated_at,version,deleted) values ('S-OTHER-TENANT','OTHER','其他租户供应商','13900000051','pending',false,current_timestamp,current_timestamp,0,false)");
        jdbc.update("insert into org_farm(id,tenant_id,name,region,status,created_at,updated_at,version,deleted) values ('F-OTHER-TENANT','OTHER','其他租户门店','湘西','pending',current_timestamp,current_timestamp,0,false)");
        RestClient client = RestClient.builder().baseUrl("http://localhost:" + port).build();
        assertFalse(client.get().uri("/api/v1/org/suppliers").retrieve().body(JsonNode.class).path("data").toString().contains("S-OTHER-TENANT"));
        assertFalse(client.get().uri("/api/v1/org/farms").retrieve().body(JsonNode.class).path("data").toString().contains("F-OTHER-TENANT"));
        assertThrows(RestClientResponseException.class, () -> client.put().uri("/api/v1/org/suppliers/S-OTHER-TENANT")
                .contentType(MediaType.APPLICATION_JSON).body(Map.of("name", "越权修改", "contactPhone", "13900000051")).retrieve().body(JsonNode.class));
        assertThrows(RestClientResponseException.class, () -> client.put().uri("/api/v1/org/farms/F-OTHER-TENANT")
                .contentType(MediaType.APPLICATION_JSON).body(Map.of("name", "越权修改", "profile", Map.of("address", "新地址"))).retrieve().body(JsonNode.class));
    }

    @Test
    void retiredSupplierPhoneCannotBeReusedAndInvalidProfilesAreRejected() {
        RestClient client = RestClient.builder().baseUrl("http://localhost:" + port).build();
        JsonNode created = client.post().uri("/api/v1/org/suppliers").contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("name", "原供应商", "contactPhone", "13900000061")).retrieve().body(JsonNode.class);
        String id = created.path("data").path("id").asText();
        jdbc.update("update org_supplier set deleted=true where id=?", id);
        assertThrows(RestClientResponseException.class, () -> client.post().uri("/api/v1/org/suppliers")
                .contentType(MediaType.APPLICATION_JSON).body(Map.of("name", "复用手机号", "contactPhone", "13900000061")).retrieve().body(JsonNode.class));
        assertThrows(RestClientResponseException.class, () -> client.post().uri("/api/v1/org/suppliers")
                .contentType(MediaType.APPLICATION_JSON).body(Map.of("name", "品牌字段错误", "contactPhone", "13900000062", "profile", Map.of("brands", "不是数组"))).retrieve().body(JsonNode.class));
        assertThrows(RestClientResponseException.class, () -> client.post().uri("/api/v1/org/farms")
                .contentType(MediaType.APPLICATION_JSON).body(Map.of("name", "评分错误", "profile", Map.of("address", "湖南省长沙市", "rating", 8))).retrieve().body(JsonNode.class));
        assertThrows(RestClientResponseException.class, () -> client.post().uri("/api/v1/org/farms")
                .contentType(MediaType.APPLICATION_JSON).body(Map.of("name", "定位错误", "profile", Map.of("address", "湖南省长沙市", "location", Map.of("longitude", 300, "latitude", 20)))).retrieve().body(JsonNode.class));
    }

    @Test
    void uploadedProfileImageGetsStableIdAndCanBeReadBack() {
        RestClient client = RestClient.builder().baseUrl("http://localhost:" + port).build();
        byte[] png = Base64.getDecoder().decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9RVK8AAAAASUVORK5CYII=");
        JsonNode uploaded = client.post().uri("/api/v1/org/media").contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("mimeType", "image/png", "purpose", "farm-cover", "base64", Base64.getEncoder().encodeToString(png)))
                .retrieve().body(JsonNode.class);
        String id = uploaded.path("data").path("assetId").asText();
        assertTrue(id.startsWith("ORG-MEDIA-"));
        byte[] fetched = client.get().uri("/api/v1/org/media/" + id).retrieve().body(byte[].class);
        assertArrayEquals(png, fetched);
        assertThrows(RestClientResponseException.class, () -> client.post().uri("/api/v1/org/media")
                .contentType(MediaType.APPLICATION_JSON).body(Map.of("mimeType", "text/plain", "purpose", "farm-cover", "base64", "YWJj"))
                .retrieve().body(JsonNode.class));
    }

    @Test
    void profileRejectsMissingOrWrongPurposeMediaReferences() {
        RestClient client = RestClient.builder().baseUrl("http://localhost:" + port).build();
        assertThrows(RestClientResponseException.class, () -> client.post().uri("/api/v1/org/farms")
                .contentType(MediaType.APPLICATION_JSON).body(Map.of("name", "假图片门店", "profile", Map.of("address", "湖南省长沙市", "image", Map.of("source", "asset", "assetId", "ORG-MEDIA-MISSING"))))
                .retrieve().body(JsonNode.class));
        byte[] png = Base64.getDecoder().decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9RVK8AAAAASUVORK5CYII=");
        JsonNode uploaded = client.post().uri("/api/v1/org/media").contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("mimeType", "image/png", "purpose", "farm-cover", "base64", Base64.getEncoder().encodeToString(png)))
                .retrieve().body(JsonNode.class);
        String id = uploaded.path("data").path("assetId").asText();
        assertThrows(RestClientResponseException.class, () -> client.post().uri("/api/v1/org/suppliers")
                .contentType(MediaType.APPLICATION_JSON).body(Map.of("name", "错用图片供应商", "contactPhone", "13900000072", "profile", Map.of("businessLicense", Map.of("source", "asset", "assetId", id))))
                .retrieve().body(JsonNode.class));
        JsonNode farm = client.post().uri("/api/v1/org/farms").contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("name", "正确图片门店", "profile", Map.of("address", "湖南省长沙市", "image", Map.of("source", "asset", "assetId", id))))
                .retrieve().body(JsonNode.class);
        assertEquals(id, farm.path("data").path("profile").path("image").path("assetId").asText());
    }
}

package com.agritainmen.catalog;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.TestPropertySource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@Tag("api-audit")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = "spring.profiles.active=test")
@TestPropertySource(properties = "spring.autoconfigure.exclude=org.springframework.boot.security.autoconfigure.web.servlet.ServletWebSecurityAutoConfiguration,org.springframework.boot.security.autoconfigure.actuate.web.servlet.ManagementWebSecurityAutoConfiguration")
class CatalogApiAuditTest {
    @LocalServerPort
    private int port;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private ObjectMapper objectMapper;

    private RestClient restClient;

    @BeforeEach
    void setUp() {
        restClient = RestClient.builder().baseUrl("http://localhost:" + port).build();
        jdbc.update("delete from catalog_sku");
        jdbc.update("delete from catalog_product");
        jdbc.update("""
                insert into catalog_product(id, tenant_id, supplier_id, name, category, channel, enabled, created_at, updated_at, version, deleted)
                values ('P-AUDIT-1', 'PLATFORM', 'S-AUDIT-1', 'Audit Product', 'fresh', 'store', true, current_timestamp, current_timestamp, 0, false)
                """);
        jdbc.update("""
                insert into catalog_sku(id, tenant_id, product_id, name, price_cents, enabled, created_at, updated_at, version, deleted)
                values ('SKU-AUDIT-1', 'PLATFORM', 'P-AUDIT-1', '500g', 5990, true, current_timestamp, current_timestamp, 0, false)
                """);
    }

    @Test
    void quoteReturnsServerStoredPriceInUniformEnvelope() {
        ApiResult result = get("/api/v1/catalog/skus/SKU-AUDIT-1/quote");

        assertEnvelope(result, 200, "OK");
        JsonNode data = result.body().path("data");
        assertAll(
                () -> assertEquals("SKU-AUDIT-1", data.path("skuId").asText()),
                () -> assertEquals("P-AUDIT-1", data.path("productId").asText()),
                () -> assertEquals("S-AUDIT-1", data.path("supplierId").asText()),
                () -> assertEquals("Audit Product", data.path("name").asText()),
                () -> assertEquals(5990L, data.path("unitPriceCents").asLong())
        );
    }

    @Test
    void unknownSkuReturnsNotFoundEnvelope() {
        ApiResult result = get("/api/v1/catalog/skus/SKU-MISSING/quote");

        assertEnvelope(result, 404, "NOT_FOUND");
    }

    private ApiResult get(String path) {
        try {
            var response = restClient.get().uri(path).retrieve().toEntity(String.class);
            return new ApiResult(
                    response.getStatusCode().value(),
                    response.getHeaders().getFirst("X-Trace-Id"),
                    parse(response.getBody())
            );
        } catch (RestClientResponseException exception) {
            return new ApiResult(
                    exception.getStatusCode().value(),
                    exception.getResponseHeaders().getFirst("X-Trace-Id"),
                    parse(exception.getResponseBodyAsString())
            );
        }
    }

    private JsonNode parse(String body) {
        return objectMapper.readTree(body == null || body.isBlank() ? "{}" : body);
    }

    private void assertEnvelope(ApiResult result, int expectedStatus, String expectedCode) {
        assertAll("uniform API envelope",
                () -> assertEquals(expectedStatus, result.status()),
                () -> assertNotNull(result.body()),
                () -> assertEquals(expectedCode, result.body().path("code").asText()),
                () -> assertFalse(result.body().path("message").asText().isBlank()),
                () -> assertTrue(result.body().has("data")),
                () -> assertFalse(result.body().path("timestamp").asText().isBlank()),
                () -> assertFalse(result.body().path("traceId").asText().isBlank()),
                () -> assertEquals(result.body().path("traceId").asText(), result.traceIdHeader())
        );
        if (!"OK".equals(expectedCode)) {
            assertTrue(result.body().path("data").isNull());
        }
    }

    private record ApiResult(int status, String traceIdHeader, JsonNode body) {}
}

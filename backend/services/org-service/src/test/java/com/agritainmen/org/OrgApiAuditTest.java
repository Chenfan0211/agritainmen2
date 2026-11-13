package com.agritainmen.org;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.List;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@Tag("api-audit")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = "spring.profiles.active=test")
@TestPropertySource(properties = {
        "agritainmen.demo.seed-enabled=false",
        "agritainmen.security.org.enabled=false"
})
@Import(OrgWriteAuditTest.PermitAllApiAuditSecurity.class)
class OrgApiAuditTest {
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
        jdbc.update("delete from org_driver");
        jdbc.update("delete from org_leader");
        jdbc.update("delete from org_farm");
        jdbc.update("delete from org_supplier");
        jdbc.update("""
                insert into org_supplier(id, tenant_id, name, contact_phone, region, category, status, created_at, updated_at, version, deleted)
                values ('S-AUDIT-1', 'PLATFORM', 'Audit Supplier', '13800000001', 'Hunan', 'fresh', 'active', current_timestamp, current_timestamp, 0, false)
                """);
        jdbc.update("""
                insert into org_farm(id, tenant_id, name, region, status, created_at, updated_at, version, deleted)
                values ('F-AUDIT-1', 'PLATFORM', 'Audit Farm', 'Hunan', 'active', current_timestamp, current_timestamp, 0, false)
                """);
        jdbc.update("""
                insert into org_driver(id, tenant_id, supplier_id, name, phone, status, created_at, updated_at, version, deleted)
                values ('D-AUDIT-1', 'PLATFORM', 'S-AUDIT-1', 'Audit Driver', '13900000001', 'active', current_timestamp, current_timestamp, 0, false)
                """);
        jdbc.update("""
                insert into org_leader(id, tenant_id, name, level, leader_id, parent_leader_id, status, created_at, updated_at, version, deleted)
                values ('T-AUDIT-1', 'PLATFORM', 'Audit Leader', 'level1', 'T-AUDIT-1', null, 'active', current_timestamp, current_timestamp, 0, false)
                """);
    }

    static Stream<OrgListCase> listEndpoints() {
        return Stream.of(
                new OrgListCase("/api/v1/org/suppliers", "S-AUDIT-1",
                        List.of("name", "contact_phone", "region", "status")),
                new OrgListCase("/api/v1/org/farms", "F-AUDIT-1",
                        List.of("name", "region", "status")),
                new OrgListCase("/api/v1/org/drivers", "D-AUDIT-1",
                        List.of("supplier_id", "name", "phone", "status")),
                new OrgListCase("/api/v1/org/leaders", "T-AUDIT-1",
                        List.of("name", "level", "leader_id", "status"))
        );
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("listEndpoints")
    void listEndpointsReturnUniformEnvelopeAndSeededRows(OrgListCase endpoint) {
        ApiResult result = get(endpoint.path());

        assertEnvelope(result, 200, "OK");
        JsonNode data = result.body().path("data");
        assertAll(
                () -> assertTrue(data.isArray()),
                () -> assertEquals(1, data.size()),
                () -> assertEquals(endpoint.id(), data.path(0).path("id").asText()),
                () -> endpoint.fields().forEach(field ->
                        assertTrue(data.path(0).hasNonNull(field), "missing field " + field))
        );
    }

    @Test
    void unknownOrgEndpointUsesNotFoundEnvelope() {
        ApiResult result = get("/api/v1/org/not-a-real-resource");

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

    private record OrgListCase(String path, String id, List<String> fields) {
        @Override
        public String toString() {
            return path;
        }
    }
}

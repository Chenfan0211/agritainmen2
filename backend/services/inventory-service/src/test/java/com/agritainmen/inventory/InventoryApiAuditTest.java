package com.agritainmen.inventory;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.client.RestClient;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@Tag("api-audit")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = "spring.profiles.active=test")
class InventoryApiAuditTest {
    @MockitoBean InventoryAccessVerifier accessVerifier;
    private static final String SKU_ID = "SKU-AUDIT-1";

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
        jdbc.update("delete from inventory_ledger");
        jdbc.update("delete from inventory_reservation_item");
        jdbc.update("delete from inventory_reservation");
        jdbc.update("delete from inventory_stock");
        jdbc.update("delete from sys_outbox_event");
        jdbc.update("delete from sys_idempotency_record");
        jdbc.update("""
                insert into inventory_stock(id, tenant_id, sku_id, available_qty, reserved_qty, created_at, updated_at, version, deleted)
                values ('STOCK-AUDIT-1', 'PLATFORM', ?, 10, 0, current_timestamp, current_timestamp, 0, false)
                """, SKU_ID);
    }

    @Test
    void availableReturnsCurrentQuantityInUniformEnvelope() {
        assertAvailable(10);

        ApiResult result = get(availablePath());
        assertEnvelope(result, 200, "OK");
        assertEquals(10, result.body().path("data").asInt());
    }

    @Test
    void reserveReplaysSameIdempotencyRequestWithoutChangingStock() {
        String body = reserveBody("ORDER-IDEM-1", 2);
        ApiResult first = postJson("/api/v1/inventory/reservations", body, "IDEM-1");

        assertEnvelope(first, 200, "OK");
        assertReservation(first, "RESERVED", "ORDER-IDEM-1", 2);
        String reservationId = first.body().path("data").path("id").asText();
        assertAvailable(8);

        ApiResult replay = postJson("/api/v1/inventory/reservations", body, "IDEM-1");

        assertEnvelope(replay, 200, "OK");
        assertReservation(replay, "RESERVED", "ORDER-IDEM-1", 2);
        assertAll(
                () -> assertEquals(reservationId, replay.body().path("data").path("id").asText()),
                () -> assertEquals(1, count("select count(*) from inventory_reservation")),
                () -> assertEquals(1, count("select count(*) from inventory_ledger where change_type='RESERVE'")),
                () -> assertEquals(1, count("select count(*) from sys_outbox_event")),
                () -> assertAvailable(8)
        );
    }

    @Test
    void reserveRejectsIdempotencyKeyReuseWithDifferentRequest() {
        ApiResult first = postJson("/api/v1/inventory/reservations", reserveBody("ORDER-IDEM-2", 2), "IDEM-2");
        assertEnvelope(first, 200, "OK");

        ApiResult conflict = postJson("/api/v1/inventory/reservations", reserveBody("ORDER-IDEM-3", 1), "IDEM-2");

        assertAll(
                () -> assertEnvelope(conflict, 409, "IDEMPOTENCY_CONFLICT"),
                () -> assertEquals(1, count("select count(*) from inventory_reservation")),
                () -> assertDatabaseAvailable(8)
        );
    }

    @Test
    void reserveRequiresIdempotencyKey() {
        ApiResult result = postJson("/api/v1/inventory/reservations", reserveBody("ORDER-NO-KEY", 1), null);

        assertEnvelope(result, 400, "BAD_REQUEST");
        assertAll(
                () -> assertEquals(0, count("select count(*) from inventory_reservation")),
                () -> assertDatabaseAvailable(10)
        );
    }

    @ParameterizedTest
    @MethodSource("invalidReserveBodies")
    void reserveRejectsInvalidParameters(String body) {
        ApiResult result = postJson("/api/v1/inventory/reservations", body, "IDEM-INVALID");

        assertEnvelope(result, 400, "BAD_REQUEST");
        assertEquals(0, count("select count(*) from inventory_reservation"));
    }

    @Test
    void reserveWithInsufficientStockReturnsConflictAndRollsBack() {
        ApiResult result = postJson("/api/v1/inventory/reservations", reserveBody("ORDER-OUT-OF-STOCK", 11), "IDEM-OOS");

        assertAll(
                () -> assertEnvelope(result, 409, "OUT_OF_STOCK"),
                () -> assertEquals(0, count("select count(*) from inventory_reservation")),
                () -> assertDatabaseAvailable(10),
                () -> assertDatabaseReserved(0)
        );
    }

    @Test
    void releaseRestoresAvailabilityAndIsIdempotent() {
        String reservationId = reserve("ORDER-RELEASE", 2, "IDEM-RELEASE");
        String releasePath = "/api/v1/inventory/reservations/" + reservationId + "/release";

        ApiResult released = postWithoutBody(releasePath);
        assertEnvelope(released, 200, "OK");
        assertReservation(released, "RELEASED", "ORDER-RELEASE", 2);
        assertAvailable(10);

        ApiResult replay = postWithoutBody(releasePath);
        assertEnvelope(replay, 200, "OK");
        assertReservation(replay, "RELEASED", "ORDER-RELEASE", 2);
        assertAll(
                () -> assertAvailable(10),
                () -> assertDatabaseAvailable(10),
                () -> assertDatabaseReserved(0)
        );
    }

    @Test
    void confirmDeductsReservedStockAndIsIdempotent() {
        String reservationId = reserve("ORDER-CONFIRM", 3, "IDEM-CONFIRM");
        String confirmPath = "/api/v1/inventory/reservations/" + reservationId + "/confirm";

        ApiResult confirmed = postWithoutBody(confirmPath);
        assertEnvelope(confirmed, 200, "OK");
        assertReservation(confirmed, "CONFIRMED", "ORDER-CONFIRM", 3);
        assertAll(
                () -> assertAvailable(7),
                () -> assertDatabaseAvailable(7),
                () -> assertDatabaseReserved(0),
                () -> assertEquals(1, count("select count(*) from inventory_ledger where change_type='SALE'"))
        );

        ApiResult replay = postWithoutBody(confirmPath);
        assertEnvelope(replay, 200, "OK");
        assertAll(
                () -> assertReservation(replay, "CONFIRMED", "ORDER-CONFIRM", 3),
                () -> assertEquals(1, count("select count(*) from inventory_ledger where change_type='SALE'")),
                () -> assertAvailable(7)
        );
    }

    @Test
    void confirmRejectsReleasedReservationWithConflict() {
        String reservationId = reserve("ORDER-RELEASED-CONFIRM", 1, "IDEM-RELEASED-CONFIRM");
        ApiResult released = postWithoutBody("/api/v1/inventory/reservations/" + reservationId + "/release");
        assertEnvelope(released, 200, "OK");

        ApiResult conflict = postWithoutBody("/api/v1/inventory/reservations/" + reservationId + "/confirm");

        assertAll(
                () -> assertEnvelope(conflict, 409, "CONFLICT"),
                () -> assertAvailable(10)
        );
    }

    @ParameterizedTest
    @ValueSource(strings = {"release", "confirm"})
    void unknownReservationReturnsNotFound(String action) {
        ApiResult result = postWithoutBody("/api/v1/inventory/reservations/RES-MISSING/" + action);

        assertEnvelope(result, 404, "NOT_FOUND");
    }

    @Test
    void adjustUpdatesAvailableQuantity() {
        ApiResult increase = postJson("/api/v1/inventory/skus/" + SKU_ID + "/adjust",
                "{\"delta\":5,\"reason\":\"restock\"}", null);
        assertEnvelope(increase, 200, "OK");
        assertTrue(increase.body().path("data").isNull());
        assertAvailable(15);

        ApiResult decrease = postJson("/api/v1/inventory/skus/" + SKU_ID + "/adjust",
                "{\"delta\":-3,\"reason\":\"shrinkage\"}", null);
        assertEnvelope(decrease, 200, "OK");
        assertAvailable(12);
    }

    @Test
    void adjustBelowZeroReturnsConflictWithoutChangingStock() {
        ApiResult result = postJson("/api/v1/inventory/skus/" + SKU_ID + "/adjust",
                "{\"delta\":-11,\"reason\":\"oversell\"}", null);

        assertAll(
                () -> assertEnvelope(result, 409, "CONFLICT"),
                () -> assertAvailable(10),
                () -> assertDatabaseAvailable(10)
        );
    }

    @ParameterizedTest
    @MethodSource("invalidAdjustBodies")
    void adjustRejectsInvalidParameters(String body) {
        ApiResult result = postJson("/api/v1/inventory/skus/" + SKU_ID + "/adjust", body, null);

        assertEnvelope(result, 400, "BAD_REQUEST");
        assertAvailable(10);
    }

    static Stream<String> invalidReserveBodies() {
        return Stream.of(
                "{\"orderId\":\"\",\"items\":[{\"skuId\":\"" + SKU_ID + "\",\"quantity\":1}]}",
                "{\"orderId\":\"ORDER-INVALID\",\"items\":[]}",
                "{\"orderId\":\"ORDER-INVALID\",\"items\":[{\"skuId\":\"" + SKU_ID + "\",\"quantity\":0}]}"
        );
    }

    static Stream<String> invalidAdjustBodies() {
        return Stream.of(
                "{\"delta\":0,\"reason\":\"zero-change\"}",
                "{\"delta\":1,\"reason\":\" \"}",
                "{\"reason\":\"missing-delta\"}"
        );
    }

    private String reserve(String orderId, int quantity, String idempotencyKey) {
        ApiResult result = postJson("/api/v1/inventory/reservations", reserveBody(orderId, quantity), idempotencyKey);
        assertEnvelope(result, 200, "OK");
        assertReservation(result, "RESERVED", orderId, quantity);
        return result.body().path("data").path("id").asText();
    }

    private String reserveBody(String orderId, int quantity) {
        return "{\"orderId\":\"" + orderId + "\",\"items\":[{\"skuId\":\"" + SKU_ID + "\",\"quantity\":" + quantity + "}]}";
    }

    private String availablePath() {
        return "/api/v1/inventory/skus/" + SKU_ID + "/available";
    }

    private void assertAvailable(int expected) {
        ApiResult result = get(availablePath());
        assertEnvelope(result, 200, "OK");
        assertEquals(expected, result.body().path("data").asInt());
    }

    private void assertDatabaseAvailable(int expected) {
        assertEquals(expected, jdbc.queryForObject(
                "select available_qty from inventory_stock where sku_id=?", Integer.class, SKU_ID));
    }

    private void assertDatabaseReserved(int expected) {
        assertEquals(expected, jdbc.queryForObject(
                "select reserved_qty from inventory_stock where sku_id=?", Integer.class, SKU_ID));
    }

    private int count(String sql) {
        return jdbc.queryForObject(sql, Integer.class);
    }

    private void assertReservation(ApiResult result, String status, String orderId, int quantity) {
        JsonNode data = result.body().path("data");
        assertAll("reservation",
                () -> assertFalse(data.path("id").asText().isBlank()),
                () -> assertEquals(orderId, data.path("orderId").asText()),
                () -> assertEquals(status, data.path("status").asText()),
                () -> assertTrue(data.path("items").isArray()),
                () -> assertEquals(1, data.path("items").size()),
                () -> assertEquals(SKU_ID, data.path("items").path(0).path("skuId").asText()),
                () -> assertEquals(quantity, data.path("items").path(0).path("quantity").asInt()),
                () -> assertFalse(data.path("expiresAt").asText().isBlank()),
                () -> assertFalse(data.path("createdAt").asText().isBlank())
        );
    }

    private ApiResult get(String path) {
        try {
            var response = restClient.get().uri(path).retrieve().toEntity(String.class);
            return result(response.getStatusCode().value(),
                    response.getHeaders().getFirst("X-Trace-Id"), response.getBody());
        } catch (RestClientResponseException exception) {
            return result(exception.getStatusCode().value(),
                    exception.getResponseHeaders().getFirst("X-Trace-Id"), exception.getResponseBodyAsString());
        }
    }

    private ApiResult postJson(String path, String body, String idempotencyKey) {
        try {
            var request = restClient.post().uri(path).contentType(MediaType.APPLICATION_JSON);
            if (idempotencyKey != null) {
                request = request.header("Idempotency-Key", idempotencyKey);
            }
            var response = request.body(body).retrieve().toEntity(String.class);
            return result(response.getStatusCode().value(),
                    response.getHeaders().getFirst("X-Trace-Id"), response.getBody());
        } catch (RestClientResponseException exception) {
            return result(exception.getStatusCode().value(),
                    exception.getResponseHeaders().getFirst("X-Trace-Id"), exception.getResponseBodyAsString());
        }
    }

    private ApiResult postWithoutBody(String path) {
        try {
            var response = restClient.post().uri(path).retrieve().toEntity(String.class);
            return result(response.getStatusCode().value(),
                    response.getHeaders().getFirst("X-Trace-Id"), response.getBody());
        } catch (RestClientResponseException exception) {
            return result(exception.getStatusCode().value(),
                    exception.getResponseHeaders().getFirst("X-Trace-Id"), exception.getResponseBodyAsString());
        }
    }

    private ApiResult result(int status, String traceIdHeader, String body) {
        return new ApiResult(status, traceIdHeader, parse(body));
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

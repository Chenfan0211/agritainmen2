package com.agritainmen.settlement;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

@Tag("api-audit")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "spring.profiles.active=test")
class SettlementBearerScopeAuditTest {
    static final HttpServer AUTH = authServer();
    @Value("${local.server.port}") int port;
    @Autowired JdbcTemplate jdbc;
    RestClient client;

    @DynamicPropertySource
    static void authUrl(DynamicPropertyRegistry registry) {
        registry.add("agritainmen.clients.auth.base-url", () -> "http://127.0.0.1:" + AUTH.getAddress().getPort());
    }

    @BeforeEach void setUp() { client = RestClient.builder().baseUrl("http://127.0.0.1:" + port).build(); }

    @Test void commissionLedgerRequiresCurrentAdminPermission() {
        assertEquals(401, getStatus("/api/v1/commissions", null));
        assertEquals(403, getStatus("/api/v1/commissions", "leader-a"));
        assertEquals(403, getStatus("/api/v1/commissions", "admin-none"));
        assertEquals(403, getStatus("/api/v1/commissions", "admin-foreign"));
        int spoofed = client.get().uri("/api/v1/commissions")
                .header("Authorization", "Bearer supplier")
                .header("X-Actor-Type", "admin").header("X-Actor-Id", "ADMIN-1")
                .exchange((sent, response) -> response.getStatusCode().value());
        assertEquals(403, spoofed);
        assertEquals(200, getStatus("/api/v1/commissions", "admin-commission"));

        Map<String, Object> body = Map.of("sourceId", "SOURCE-" + UUID.randomUUID(),
                "beneficiaryId", "T001", "amountCents", 100, "direction", "LEVEL_1");
        assertEquals(403, postStatus("/api/v1/commissions", "leader-a", body));
        assertEquals(403, postStatus("/api/v1/commissions", "admin-none", body));
        assertEquals(200, postStatus("/api/v1/commissions", "admin-commission", body));
    }

    @Test void leaderCanReadAndRequestOnlyOwnCommission() {
        assertEquals(401, getStatus("/api/v1/withdrawals/me?requesterId=T001", null));
        assertEquals(200, getStatus("/api/v1/withdrawals/me?requesterId=T001", "leader-a"));
        assertEquals(403, getStatus("/api/v1/withdrawals/me?requesterId=T002", "leader-a"));
        assertEquals(403, getStatus("/api/v1/withdrawals/me?requesterId=T001", "normal-user"));
        assertEquals(401, getStatus("/api/v1/commissions/me?beneficiaryId=T001", null));
        assertEquals(200, getStatus("/api/v1/commissions/me?beneficiaryId=T001", "leader-a"));
        assertEquals(403, getStatus("/api/v1/commissions/me?beneficiaryId=T002", "leader-a"));
        assertEquals(403, getStatus("/api/v1/commissions/me?beneficiaryId=T001", "normal-user"));
        assertEquals(403, getStatus("/api/v1/commissions/me?beneficiaryId=T001", "supplier"));
        assertEquals(401, getStatus("/api/v1/commissions/me?beneficiaryId=T001", "revoked"));
        assertEquals(200, getStatus("/api/v1/commissions/me?beneficiaryId=T002", "leader-b"));
        assertEquals(403, getStatus("/api/v1/commissions/me?beneficiaryId=T001", "leader-b"));
        assertEquals(200, getStatus("/api/v1/commissions/me?beneficiaryId=T002", "admin-commission"));

        Map<String, Object> own = Map.of("requesterId", "T001", "amountCents", 100, "method", "WECHAT");
        Map<String, Object> other = Map.of("requesterId", "T002", "amountCents", 100, "method", "WECHAT");
        seedCommission("T001", 100);
        assertEquals(403, postStatus("/api/v1/withdrawals", "leader-a", other));
        assertEquals(403, postStatus("/api/v1/withdrawals", "normal-user", own));
        assertEquals(200, postStatus("/api/v1/withdrawals", "leader-a", own));
    }

    @Test void reviewUsesVerifiedOperatorAndWithdrawalPermission() {
        seedCommission("T001", 100);
        seedCommission("T002", 100);
        JsonNode created = postBody("/api/v1/withdrawals", "leader-a",
                Map.of("requesterId", "T001", "amountCents", 100, "method", "WECHAT"));
        String id = created.path("data").path("id").asText();
        assertFalse(id.isBlank());
        String path = "/api/v1/withdrawals/" + id + "/review";
        Map<String, Object> forged = Map.of("approved", true, "operator", "FORGED", "note", "ok");
        assertEquals(403, postStatus(path, "leader-a", forged));
        assertEquals(403, postStatus(path, "admin-none", forged));
        JsonNode reviewed = postBody(path, "admin-review", forged);
        assertEquals("ADMIN-REVIEW", reviewed.path("data").path("reviewedBy").asText());
        assertEquals(409, postStatus(path, "admin-review", forged));
        JsonNode second = postBody("/api/v1/withdrawals", "leader-b",
                Map.of("requesterId", "T002", "amountCents", 100, "method", "WECHAT"));
        assertEquals(200, postStatus("/api/v1/withdrawals/" + second.path("data").path("id").asText() + "/review",
                "admin-leader-review", Map.of("approved", false)));
    }

    @Test void configurationWritesRequireMatchingAdminPermission() {
        String rule = "/api/v1/commissions/rules/R-" + UUID.randomUUID();
        Map<String, Object> body = Map.of("name", "测试规则", "promoterRate", 0.1, "storeRate", 0.1, "enabled", true);
        assertEquals(401, putStatus(rule, null, body));
        assertEquals(403, putStatus(rule, "leader-a", body));
        assertEquals(403, putStatus(rule, "admin-none", body));
        assertEquals(403, putStatus(rule, "admin-leader", body));
        assertEquals(200, putStatus(rule, "admin-commission", body));

        String share = "/api/v1/commissions/share-config";
        assertEquals(403, putStatus(share, "leader-a", body));
        assertEquals(403, putStatus(share, "admin-none", body));
        assertEquals(200, putStatus(share, "admin-leader", body));
        assertEquals(200, putStatus(share, "admin-commission", body));
    }

    @Test void platformAdminCannotReadOrChangeAnotherTenantRows() {
        String suffix = UUID.randomUUID().toString();
        String beneficiary = "FOREIGN-" + suffix;
        String commissionId = "C-" + suffix;
        jdbc.update("insert into settlement_commission(id,tenant_id,source_id,beneficiary_id,amount_cents,direction,status,created_at,updated_at,version,deleted) values (?, 'OTHER', ?, ?, 900, 'LEVEL_1', 'AVAILABLE', current_timestamp, current_timestamp, 0, false)", commissionId, "SOURCE-" + suffix, beneficiary);
        JsonNode list = client.get().uri("/api/v1/commissions?beneficiaryId=" + beneficiary)
                .header("Authorization", "Bearer admin-commission").retrieve().body(JsonNode.class);
        assertEquals(0, list.path("data").path("total").asInt());
        JsonNode mine = client.get().uri("/api/v1/commissions/me?beneficiaryId=" + beneficiary)
                .header("Authorization", "Bearer admin-commission").retrieve().body(JsonNode.class);
        assertEquals(0, mine.path("data").path("availableCents").asInt());

        String withdrawalId = "W-" + suffix;
        jdbc.update("insert into settlement_withdrawal(id,tenant_id,requester_id,amount_cents,method,status,created_at,updated_at,version,deleted) values (?, 'OTHER', ?, 100, 'WECHAT', 'PENDING', current_timestamp, current_timestamp, 0, false)", withdrawalId, beneficiary);
        assertEquals(404, postStatus("/api/v1/withdrawals/" + withdrawalId + "/review", "admin-review", Map.of("approved", true)));
        assertEquals("PENDING", jdbc.queryForObject("select status from settlement_withdrawal where id=?", String.class, withdrawalId));

        String ruleId = "R-" + suffix;
        jdbc.update("insert into settlement_commission_rule(id,tenant_id,name,promoter_rate,store_rate,enabled,created_at,updated_at,version,deleted) values (?, 'OTHER', 'foreign', 0.5, 0.5, true, current_timestamp, current_timestamp, 0, false)", ruleId);
        assertEquals(404, putStatus("/api/v1/commissions/rules/" + ruleId, "admin-commission",
                Map.of("name", "changed", "promoterRate", 0.1, "storeRate", 0.1, "enabled", true)));
        assertEquals("foreign", jdbc.queryForObject("select name from settlement_commission_rule where id=?", String.class, ruleId));

        String configId = "SHARE-" + suffix;
        jdbc.update("insert into settlement_share_config(id,tenant_id,promoter_rate,created_at,updated_at,version,deleted) values (?, 'OTHER', 0.77, current_timestamp, current_timestamp, 0, false)", configId);
        assertEquals(200, putStatus("/api/v1/commissions/share-config", "admin-commission", Map.of("promoterRate", 0.11)));
        assertEquals(0.77, jdbc.queryForObject("select promoter_rate from settlement_share_config where id=?", Double.class, configId));
    }

    private int getStatus(String path, String token) {
        var request = client.get().uri(path);
        if (token != null) request.header("Authorization", "Bearer " + token);
        return request.exchange((sent, response) -> response.getStatusCode().value());
    }

    private void seedCommission(String requesterId, long amountCents) {
        String suffix = UUID.randomUUID().toString();
        jdbc.update("insert into settlement_commission(id,tenant_id,source_id,beneficiary_id,amount_cents,direction,status,created_at,updated_at,version,deleted) values (?, 'PLATFORM', ?, ?, ?, 'LEVEL_1', 'AVAILABLE', current_timestamp, current_timestamp, 0, false)", "C-" + suffix, "S-" + suffix, requesterId, amountCents);
    }

    private int postStatus(String path, String token, Object body) {
        var request = client.post().uri(path).contentType(MediaType.APPLICATION_JSON).body(body);
        if (token != null) request.header("Authorization", "Bearer " + token);
        if (path.equals("/api/v1/withdrawals")) request.header("Idempotency-Key", UUID.randomUUID().toString());
        return request.exchange((sent, response) -> response.getStatusCode().value());
    }

    private JsonNode postBody(String path, String token, Object body) {
        var request = client.post().uri(path).contentType(MediaType.APPLICATION_JSON)
                .header("Authorization", "Bearer " + token).body(body);
        if (path.equals("/api/v1/withdrawals")) request.header("Idempotency-Key", UUID.randomUUID().toString());
        return request.retrieve().body(JsonNode.class);
    }

    private int putStatus(String path, String token, Object body) {
        var request = client.put().uri(path).contentType(MediaType.APPLICATION_JSON).body(body);
        if (token != null) request.header("Authorization", "Bearer " + token);
        return request.exchange((sent, response) -> response.getStatusCode().value());
    }

    private static HttpServer authServer() {
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/api/v1/auth/me", exchange -> {
                String token = exchange.getRequestHeaders().getFirst("Authorization");
                String profile = switch (token == null ? "" : token) {
                    case "Bearer leader-a" -> "\"actorType\":\"user\",\"actorId\":\"U-A\",\"level\":\"level1\",\"leaderId\":\"T001\"";
                    case "Bearer leader-b" -> "\"actorType\":\"user\",\"actorId\":\"U-B\",\"level\":\"level2\",\"leaderId\":\"T002\"";
                    case "Bearer normal-user" -> "\"actorType\":\"user\",\"actorId\":\"U-N\",\"level\":\"normal\",\"leaderId\":\"T001\"";
                    case "Bearer supplier" -> "\"actorType\":\"supplier\",\"actorId\":\"S-A\"";
                    case "Bearer admin-commission" -> "\"actorType\":\"admin\",\"actorId\":\"ADMIN-COMMISSION\",\"permissions\":[\"commission.manage\"]";
                    case "Bearer admin-review" -> "\"actorType\":\"admin\",\"actorId\":\"ADMIN-REVIEW\",\"permissions\":[\"withdrawal.review\"]";
                    case "Bearer admin-leader" -> "\"actorType\":\"admin\",\"actorId\":\"ADMIN-LEADER\",\"permissions\":[\"leader.manage\"]";
                    case "Bearer admin-leader-review" -> "\"actorType\":\"admin\",\"actorId\":\"ADMIN-LEADER-REVIEW\",\"permissions\":[\"leader.withdrawal.review\"]";
                    case "Bearer admin-none" -> "\"actorType\":\"admin\",\"actorId\":\"ADMIN-NONE\",\"permissions\":[]";
                    case "Bearer admin-foreign" -> "\"actorType\":\"admin\",\"actorId\":\"ADMIN-FOREIGN\",\"permissions\":[\"*\"]";
                    default -> null;
                };
                int status = profile == null ? 401 : 200;
                String tenant = "Bearer admin-foreign".equals(token) ? "OTHER" : "PLATFORM";
                String body = profile == null ? "{\"code\":\"UNAUTHORIZED\"}" :
                        "{\"code\":\"OK\",\"data\":{\"tenantId\":\"" + tenant + "\"," + profile + "}}";
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(status, bytes.length);
                try (var out = exchange.getResponseBody()) { out.write(bytes); }
            });
            server.start();
            return server;
        } catch (Exception error) { throw new IllegalStateException(error); }
    }
}

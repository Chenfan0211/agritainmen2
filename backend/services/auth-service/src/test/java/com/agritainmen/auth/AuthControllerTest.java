package com.agritainmen.auth;

import com.agritainmen.auth.service.DemoAuthSeeder;
import com.agritainmen.auth.persistence.AuthSessionMapper;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = "spring.profiles.active=test")
class AuthControllerTest {
    @Value("${local.server.port}")
    private int port;
    @Autowired
    private JsonMapper objectMapper;
    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private DemoAuthSeeder demoAuthSeeder;
    @Autowired
    private AuthSessionMapper sessionMapper;

    @Test
    void sessionRevocationIsCompareAndSet() throws Exception {
        RestClient client = RestClient.builder().baseUrl("http://127.0.0.1:" + port).build();
        String login = client.post().uri("/api/v1/auth/driver/login").contentType(MediaType.APPLICATION_JSON)
                .body("{\"account\":\"driver01\",\"password\":\"123456\"}")
                .retrieve().body(String.class);
        String refresh = objectMapper.readTree(login).path("data").path("refreshToken").asText();
        String hash;
        try {
            hash = java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256")
                    .digest(refresh.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException error) { throw new IllegalStateException(error); }
        String id = jdbc.queryForObject("select id from auth_session where refresh_token_hash=?", String.class, hash);
        assertEquals(1, sessionMapper.revokeIfActive(id, "ROTATED"));
        assertEquals(0, sessionMapper.revokeIfActive(id, "ROTATED"));
    }

    @Test
    void demoSeedIsIdempotent() {
        demoAuthSeeder.run(null);
        demoAuthSeeder.run(null);
        assertEquals(1, jdbc.queryForObject("select count(*) from auth_account where actor_type='driver' and account='driver01'", Integer.class));
        assertEquals(1, jdbc.queryForObject("select count(*) from auth_identity where openid='mock_openid_demo_normal'", Integer.class));
    }

    @Test
    void adminLoginAndMeWork() throws Exception {
        RestClient client = RestClient.builder().baseUrl("http://127.0.0.1:" + port).build();
        String body = client.post().uri("/api/v1/auth/admin/login")
                .contentType(MediaType.APPLICATION_JSON)
                .body("{\"account\":\"admin\",\"password\":\"123456\"}")
                .retrieve().body(String.class);
        String access = objectMapper.readTree(body).path("data").path("accessToken").asText();
        assertTrue(access.length() > 20);
        String me = client.get().uri("/api/v1/auth/me").header("Authorization", "Bearer " + access).retrieve().body(String.class);
        assertEquals("admin", objectMapper.readTree(me).path("data").path("actorType").asText());
    }

    @Test
    void refreshRotatesRefreshTokenAndRejectsReplay() throws Exception {
        RestClient client = RestClient.builder().baseUrl("http://127.0.0.1:" + port).build();
        String body = client.post().uri("/api/v1/auth/admin/login")
                .contentType(MediaType.APPLICATION_JSON)
                .body("{\"account\":\"admin\",\"password\":\"123456\"}")
                .retrieve().body(String.class);
        String refresh = objectMapper.readTree(body).path("data").path("refreshToken").asText();
        String refreshed = client.post().uri("/api/v1/auth/refresh")
                .contentType(MediaType.APPLICATION_JSON)
                .body("{\"refreshToken\":\"" + refresh + "\"}")
                .retrieve().body(String.class);
        String next = objectMapper.readTree(refreshed).path("data").path("refreshToken").asText();
        assertNotEquals(refresh, next);
        try {
            client.post().uri("/api/v1/auth/refresh")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body("{\"refreshToken\":\"" + refresh + "\"}")
                    .retrieve().body(String.class);
            throw new AssertionError("旧 refresh token 重放应返回 409");
        } catch (RestClientResponseException exception) {
            assertEquals(409, exception.getStatusCode().value());
            JsonNode errorBody = objectMapper.readTree(exception.getResponseBodyAsString());
            assertEquals("CONFLICT", errorBody.path("code").asText());
        }
    }

    @Test
    void adminCookieRefreshRotatesCookieForNextRefresh() throws Exception {
        RestClient client = RestClient.builder().baseUrl("http://127.0.0.1:" + port).build();
        var login = client.post().uri("/api/v1/auth/admin/login")
                .contentType(MediaType.APPLICATION_JSON)
                .body("{\"account\":\"admin\",\"password\":\"123456\"}")
                .retrieve().toEntity(String.class);
        String firstCookie = login.getHeaders().getFirst(HttpHeaders.SET_COOKIE).split(";", 2)[0];
        var refreshed = client.post().uri("/api/v1/auth/refresh")
                .header(HttpHeaders.COOKIE, firstCookie)
                .retrieve().toEntity(String.class);
        String nextCookie = refreshed.getHeaders().getFirst(HttpHeaders.SET_COOKIE).split(";", 2)[0];
        assertNotEquals(firstCookie, nextCookie);
        var again = client.post().uri("/api/v1/auth/refresh")
                .header(HttpHeaders.COOKIE, nextCookie)
                .retrieve().toEntity(String.class);
        assertTrue(objectMapper.readTree(again.getBody()).path("data").path("accessToken").asText().length() > 20);
    }

    @Test
    void wechatExchangeHonorsDemoOpenid() throws Exception {
        RestClient client = RestClient.builder().baseUrl("http://127.0.0.1:" + port).build();
        String body = client.post().uri("/api/v1/auth/wechat/exchange")
                .contentType(MediaType.APPLICATION_JSON)
                .body("{\"app\":\"user\",\"code\":\"mock_openid_demo_level1\"}")
                .retrieve().body(String.class);
        assertEquals("level1", objectMapper.readTree(body).path("data").path("profile").path("level").asText());
    }

    @Test
    void wechatExchangeCreatesNormalUserAndReturnsProfile() throws Exception {
        RestClient client = RestClient.builder().baseUrl("http://127.0.0.1:" + port).build();
        String body = client.post().uri("/api/v1/auth/wechat/exchange")
                .contentType(MediaType.APPLICATION_JSON)
                .body("{\"app\":\"user\",\"code\":\"normal-user\"}")
                .retrieve().body(String.class);
        JsonNode json = objectMapper.readTree(body);
        assertEquals("normal", json.path("data").path("profile").path("level").asText());
        assertTrue(json.path("data").path("accessToken").asText().length() > 20);
    }
}

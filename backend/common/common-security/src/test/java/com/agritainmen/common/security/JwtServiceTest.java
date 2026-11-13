package com.agritainmen.common.security;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class JwtServiceTest {
    @Test
    void createsAndParsesAccessToken() {
        JwtProperties properties = new JwtProperties();
        properties.setSecret("test-secret-test-secret-test-secret-1234");
        JwtService service = new JwtService(properties);
        String token = service.createAccessToken(new TokenClaims("u1", "user", "U1", "PLATFORM", List.of("buyer"), List.of("order.read")));
        TokenClaims claims = service.parse(token);
        assertEquals("U1", claims.actorId());
        assertEquals("PLATFORM", claims.tenantId());
    }

    @Test
    void rejectsShortSecret() {
        JwtProperties properties = new JwtProperties();
        properties.setSecret("too-short");
        assertThrows(IllegalArgumentException.class, () -> new JwtService(properties));
    }
}

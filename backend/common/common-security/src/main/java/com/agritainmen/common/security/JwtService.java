package com.agritainmen.common.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.UUID;

public class JwtService {
    private final JwtProperties properties;
    private final SecretKey key;

    public JwtService(JwtProperties properties) {
        this.properties = properties;
        byte[] secret = properties.getSecret().getBytes(StandardCharsets.UTF_8);
        if (secret.length < 32) {
            throw new IllegalArgumentException("JWT secret must be at least 32 bytes");
        }
        this.key = Keys.hmacShaKeyFor(secret);
    }

    public String createAccessToken(TokenClaims claims) {
        return createToken(claims, properties.getAccessTokenTtl().toMillis(), "access");
    }

    public String createRefreshToken(TokenClaims claims) {
        return createToken(claims, properties.getRefreshTokenTtl().toMillis(), "refresh");
    }

    public TokenClaims parse(String token) {
        Claims claims = Jwts.parser()
                .verifyWith(key)
                .requireIssuer(properties.getIssuer())
                .build()
                .parseSignedClaims(token)
                .getPayload();
        return new TokenClaims(
                claims.getSubject(),
                claims.get("actorType", String.class),
                claims.get("actorId", String.class),
                claims.get("tenantId", String.class),
                stringList(claims.get("roles")),
                stringList(claims.get("permissions")),
                claims.get("supplierId", String.class)
        );
    }

    public boolean isRefreshToken(String token) {
        Claims claims = Jwts.parser().verifyWith(key).requireIssuer(properties.getIssuer()).build()
                .parseSignedClaims(token).getPayload();
        return "refresh".equals(claims.get("tokenType", String.class));
    }

    private String createToken(TokenClaims claims, long ttlMillis, String tokenType) {
        Instant now = Instant.now();
        return Jwts.builder()
                .issuer(properties.getIssuer())
                .id(UUID.randomUUID().toString())
                .subject(claims.subject())
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusMillis(ttlMillis)))
                .claim("actorType", claims.actorType())
                .claim("actorId", claims.actorId())
                .claim("tenantId", claims.tenantId())
                .claim("roles", claims.roles() == null ? List.of() : claims.roles())
                .claim("permissions", claims.permissions() == null ? List.of() : claims.permissions())
                .claim("supplierId", claims.supplierId())
                .claim("tokenType", tokenType)
                .signWith(key)
                .compact();
    }

    @SuppressWarnings("unchecked")
    private List<String> stringList(Object value) {
        return value instanceof List<?> list ? (List<String>) list : List.of();
    }
}

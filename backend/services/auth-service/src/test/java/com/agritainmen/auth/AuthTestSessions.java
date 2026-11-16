package com.agritainmen.auth;

import org.springframework.jdbc.core.JdbcTemplate;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.UUID;

final class AuthTestSessions {
    private AuthTestSessions() {}

    static String register(JdbcTemplate jdbc, String actorId, String token) {
        try {
            String accessHash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(token.getBytes(StandardCharsets.UTF_8)));
            jdbc.update("""
                    insert into auth_session(id,tenant_id,actor_type,actor_id,refresh_token_hash,access_token_hash,
                                             expires_at,created_at,updated_at,version,deleted)
                    values (?, 'PLATFORM', 'admin', ?, ?, ?, dateadd('HOUR', 1, current_timestamp),
                            current_timestamp, current_timestamp, 0, false)
                    """, "SESSION-" + UUID.randomUUID(), actorId, UUID.randomUUID().toString(), accessHash);
            return token;
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }
}

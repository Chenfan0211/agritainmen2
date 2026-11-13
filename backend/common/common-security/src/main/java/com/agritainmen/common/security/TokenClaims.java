package com.agritainmen.common.security;

import java.util.List;

public record TokenClaims(
        String subject,
        String actorType,
        String actorId,
        String tenantId,
        List<String> roles,
        List<String> permissions,
        String supplierId
) {
    public TokenClaims(String subject, String actorType, String actorId, String tenantId,
                       List<String> roles, List<String> permissions) {
        this(subject, actorType, actorId, tenantId, roles, permissions, null);
    }
}

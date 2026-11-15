package com.agritainmen.auth.web;

import jakarta.validation.constraints.NotBlank;

import java.util.List;

public final class AuthDtos {
    private AuthDtos() {
    }
    public record LoginRequest(@NotBlank String account, @NotBlank String password) {}
    public record WechatExchangeRequest(@NotBlank String code, String app) {}
    public record RefreshRequest(@NotBlank String refreshToken) {}
    public record LogoutRequest(@NotBlank String refreshToken) {}
    public record TokenResponse(String accessToken, String refreshToken, String tokenType, long expiresInSeconds, Profile profile) {}
    public record Profile(String actorType, String actorId, String tenantId, String displayName, String userId,
                          String level, String leaderId, String parentLeaderId, List<String> roles, List<String> permissions,
                          String supplierId, String driverId, String farmId) {}
}

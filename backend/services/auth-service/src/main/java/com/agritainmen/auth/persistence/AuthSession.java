package com.agritainmen.auth.persistence;

import com.agritainmen.common.data.BaseEntity;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.Instant;

@TableName("auth_session")
public class AuthSession extends BaseEntity {
    private String actorType;
    private String actorId;
    private String refreshTokenHash;
    private String accessTokenHash;
    private Instant expiresAt;
    private Instant revokedAt;
    private String revokedReason;
    public String getActorType() { return actorType; }
    public void setActorType(String actorType) { this.actorType = actorType; }
    public String getActorId() { return actorId; }
    public void setActorId(String actorId) { this.actorId = actorId; }
    public String getRefreshTokenHash() { return refreshTokenHash; }
    public void setRefreshTokenHash(String refreshTokenHash) { this.refreshTokenHash = refreshTokenHash; }
    public String getAccessTokenHash() { return accessTokenHash; }
    public void setAccessTokenHash(String accessTokenHash) { this.accessTokenHash = accessTokenHash; }
    public Instant getExpiresAt() { return expiresAt; }
    public void setExpiresAt(Instant expiresAt) { this.expiresAt = expiresAt; }
    public Instant getRevokedAt() { return revokedAt; }
    public void setRevokedAt(Instant revokedAt) { this.revokedAt = revokedAt; }
    public String getRevokedReason() { return revokedReason; }
    public void setRevokedReason(String revokedReason) { this.revokedReason = revokedReason; }
}

package com.agritainmen.auth.service;

import com.agritainmen.auth.persistence.AuthAccount;
import com.agritainmen.auth.persistence.AuthAccountMapper;
import com.agritainmen.auth.persistence.AuthIdentity;
import com.agritainmen.auth.persistence.AuthIdentityMapper;
import com.agritainmen.auth.persistence.AuthRole;
import com.agritainmen.auth.persistence.AuthSession;
import com.agritainmen.auth.persistence.AuthSessionMapper;
import com.agritainmen.auth.web.AuthDtos.Profile;
import com.agritainmen.auth.web.AuthDtos.TokenResponse;
import com.agritainmen.auth.web.WechatExchangeClient;
import com.agritainmen.common.core.BusinessException;
import com.agritainmen.common.core.ErrorCode;
import com.agritainmen.common.core.Ids;
import com.agritainmen.common.security.JwtProperties;
import com.agritainmen.common.security.JwtService;
import com.agritainmen.common.security.TokenClaims;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;

@Service
public class AuthService {
    private final AuthAccountMapper accountMapper;
    private final AuthIdentityMapper identityMapper;
    private final AuthSessionMapper sessionMapper;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final JwtProperties jwtProperties;
    private final WechatExchangeClient wechatExchangeClient;
    private final StoreAccountBindingClient storeAccountBindingClient;
    private final JsonMapper objectMapper;

    public AuthService(AuthAccountMapper accountMapper, AuthIdentityMapper identityMapper, AuthSessionMapper sessionMapper,
                       PasswordEncoder passwordEncoder, JwtService jwtService, JwtProperties jwtProperties,
                       WechatExchangeClient wechatExchangeClient, StoreAccountBindingClient storeAccountBindingClient,
                       JsonMapper objectMapper) {
        this.accountMapper = accountMapper;
        this.identityMapper = identityMapper;
        this.sessionMapper = sessionMapper;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.jwtProperties = jwtProperties;
        this.wechatExchangeClient = wechatExchangeClient;
        this.storeAccountBindingClient = storeAccountBindingClient;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public TokenResponse login(String actorType, String account, String password) {
        AuthAccount found = accountMapper.selectOne(new LambdaQueryWrapper<AuthAccount>()
                .eq(AuthAccount::getActorType, actorType)
                .eq(AuthAccount::getAccount, account.trim())
                .eq(AuthAccount::getEnabled, true)
                .last("limit 1"));
        if (found == null || !passwordEncoder.matches(password, found.getPasswordHash())) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "账号或密码错误");
        }
        if ("supplier".equals(actorType) && (found.getSupplierId() == null || found.getSupplierId().isBlank())) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "供应商账号未绑定，请联系平台管理员");
        }
        if ("store".equals(actorType) && (found.getStoreAccountId() == null || found.getStoreAccountId().isBlank()
                || found.getFarmId() == null || found.getFarmId().isBlank())) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "门店账号未绑定，请联系平台管理员");
        }
        if ("driver".equals(actorType)) activeDriver(found, found.getDriverSupplierId());
        return issue(accountClaims(found), found.getDisplayName(), null);
    }

    @Transactional
    public TokenResponse exchangeWechat(String app, String code) {
        String openid = wechatExchangeClient.exchange(app, code);
        AuthIdentity identity = identityMapper.selectOne(new LambdaQueryWrapper<AuthIdentity>()
                .eq(AuthIdentity::getOpenid, openid).last("limit 1"));
        if (identity == null) {
            identity = new AuthIdentity();
            identity.setId(Ids.uuid("IDENTITY"));
            identity.setOpenid(openid);
            identity.setUserId(Ids.uuid("U"));
            identity.setNickname("微信用户");
            identity.setLevel("normal");
            identity.setStatus("active");
            identityMapper.insert(identity);
        }
        return issue(userClaims(identity), identity.getNickname(), identity);
    }

    @Transactional
    public TokenResponse refresh(String refreshToken) {
        TokenClaims claims = parseRefresh(refreshToken);
        AuthSession session = sessionByHash(refreshToken);
        if (session == null) throw new BusinessException(ErrorCode.UNAUTHORIZED, "刷新令牌无效或已过期");
        if (session.getRevokedAt() != null) {
            if ("ROTATED".equals(session.getRevokedReason())) {
                throw new BusinessException(ErrorCode.CONFLICT, "刷新令牌已被使用，请重新登录");
            }
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "刷新令牌无效或已被撤销");
        }
        if (session.getExpiresAt().isBefore(Instant.now())) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "刷新令牌无效或已过期");
        }
        if ("supplier".equals(claims.actorType()) || "driver".equals(claims.actorType()) || "store".equals(claims.actorType())) {
            AuthAccount account = "supplier".equals(claims.actorType()) ? activeSupplier(claims)
                    : "driver".equals(claims.actorType())
                    ? activeDriver(accountMapper.selectById(claims.actorId()), claims.supplierId())
                    : accountMapper.selectById(claims.actorId());
            claims = accountClaims(account);
        }
        if (sessionMapper.revokeIfActive(session.getId(), "ROTATED") != 1)
            throw new BusinessException(ErrorCode.CONFLICT, "刷新令牌已被使用，请重新登录");
        AuthIdentity identity = identityMapper.selectOne(new LambdaQueryWrapper<AuthIdentity>()
                .eq(AuthIdentity::getUserId, claims.subject()).last("limit 1"));
        if (identity == null) return issue(claims, null, null);
        return issue(userClaims(identity), identity.getNickname(), identity);
    }

    @Transactional
    public boolean logout(String refreshToken) {
        AuthSession session = sessionByHash(refreshToken);
        if (session == null || session.getRevokedAt() != null || session.getExpiresAt().isBefore(Instant.now())) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "刷新令牌无效或已被撤销");
        }
        if (sessionMapper.revokeIfActive(session.getId(), "LOGOUT") != 1)
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "刷新令牌无效或已被撤销");
        return true;
    }

    public TokenClaims verifyAccessToken(String token) {
        try {
            if (jwtService.isRefreshToken(token)) throw new BusinessException(ErrorCode.UNAUTHORIZED);
            TokenClaims claims = jwtService.parse(token);
            if ("supplier".equals(claims.actorType()) || "driver".equals(claims.actorType()) || "store".equals(claims.actorType())) {
                if ("supplier".equals(claims.actorType())) activeSupplier(claims);
                else if ("driver".equals(claims.actorType())) activeDriver(accountMapper.selectById(claims.actorId()), claims.supplierId());
                else {
                    AuthAccount account = accountMapper.selectById(claims.actorId());
                    StoreAccountBindingClient.Binding binding = storeAccountBindingClient.requireActive(account);
                    if (!account.getFarmId().equals(claims.subject()) || !claims.roles().contains(binding.role()))
                        throw new BusinessException(ErrorCode.UNAUTHORIZED, "门店账号已失效");
                }
                AuthSession session = sessionMapper.selectOne(new LambdaQueryWrapper<AuthSession>()
                        .eq(AuthSession::getAccessTokenHash, hash(token)).last("limit 1"));
                if (session == null || session.getRevokedAt() != null || session.getExpiresAt().isBefore(Instant.now())
                        || !claims.actorId().equals(session.getActorId())) {
                    throw new BusinessException(ErrorCode.UNAUTHORIZED, "访问令牌已失效");
                }
            }
            return claims;
        } catch (BusinessException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "访问令牌无效或已过期");
        }
    }

    public StoreAccountBindingClient.StoreFarm storeFarm(String token) {
        TokenClaims claims = verifyAccessToken(token);
        if (!"store".equals(claims.actorType())) throw new BusinessException(ErrorCode.FORBIDDEN);
        AuthAccount account = accountMapper.selectById(claims.actorId());
        return storeAccountBindingClient.farm(storeAccountBindingClient.requireActive(account));
    }

    private TokenClaims parseRefresh(String refreshToken) {
        try {
            if (!jwtService.isRefreshToken(refreshToken)) throw new BusinessException(ErrorCode.UNAUTHORIZED);
            return jwtService.parse(refreshToken);
        } catch (BusinessException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "刷新令牌无效或已过期");
        }
    }

    private AuthSession sessionByHash(String refreshToken) {
        return sessionMapper.selectOne(new LambdaQueryWrapper<AuthSession>()
                .eq(AuthSession::getRefreshTokenHash, hash(refreshToken)).last("limit 1"));
    }

    private AuthAccount activeSupplier(TokenClaims claims) {
        AuthAccount account = accountMapper.selectById(claims.actorId());
        if (account == null || !"supplier".equals(account.getActorType()) || !Boolean.TRUE.equals(account.getEnabled())
                || account.getSupplierId() == null || !account.getSupplierId().equals(claims.supplierId())
                || !account.getTenantId().equals(claims.tenantId())) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "供应商账号已失效");
        }
        return account;
    }

    private AuthAccount activeDriver(AuthAccount account, String supplierId) {
        if (account == null || !"driver".equals(account.getActorType()) || !Boolean.TRUE.equals(account.getEnabled())
                || supplierId == null || supplierId.isBlank() || !supplierId.equals(account.getDriverSupplierId())) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "司机账号已失效");
        }
        AuthAccount supplier = accountMapper.selectOne(new LambdaQueryWrapper<AuthAccount>()
                .eq(AuthAccount::getActorType, "supplier").eq(AuthAccount::getSupplierId, supplierId)
                .eq(AuthAccount::getTenantId, account.getTenantId()).eq(AuthAccount::getEnabled, true).last("limit 1"));
        if (supplier == null) throw new BusinessException(ErrorCode.UNAUTHORIZED, "所属供应商账号已失效");
        return account;
    }

    private TokenClaims accountClaims(AuthAccount account) {
        if (account == null) throw new BusinessException(ErrorCode.UNAUTHORIZED, "账号已失效");
        String actorType = account.getActorType();
        if ("store".equals(actorType)) {
            StoreAccountBindingClient.Binding binding = storeAccountBindingClient.requireActive(account);
            return new TokenClaims(account.getFarmId(), actorType, account.getId(), account.getTenantId(),
                    List.of("store", binding.role()), List.of("order.read", "order.write"));
        }
        if ("supplier".equals(actorType)) {
            return new TokenClaims(account.getId(), actorType, account.getId(), account.getTenantId(),
                    List.of("supplier"), List.of("fulfillment.read", "fulfillment.write", "driver.manage"), account.getSupplierId());
        }
        if ("driver".equals(actorType)) {
            return new TokenClaims(account.getId(), actorType, account.getId(), account.getTenantId(),
                    List.of("driver"), List.of("fulfillment.read"), account.getDriverSupplierId());
        }
        List<AuthRole> roles = accountMapper.findRoles(account.getId());
        return new TokenClaims(account.getId(), actorType, account.getId(), account.getTenantId(),
                roles.stream().map(AuthRole::getCode).toList(), permissions(roles));
    }

    private TokenClaims userClaims(AuthIdentity identity) {
        String effectiveLevel = "disabled".equalsIgnoreCase(identity.getStatus()) ? "normal" : identity.getLevel();
        List<String> roles = switch (effectiveLevel == null ? "normal" : effectiveLevel) {
            case "level2" -> List.of("user", "leader:level2");
            case "level1" -> List.of("user", "leader:level1");
            default -> List.of("user");
        };
        return new TokenClaims(identity.getUserId(), "user", identity.getUserId(), identity.getTenantId(), roles,
                List.of("catalog.read", "order.read", "order.write"));
    }

    private TokenResponse issue(TokenClaims claims, String displayName, AuthIdentity identity) {
        String access = jwtService.createAccessToken(claims);
        String refresh = jwtService.createRefreshToken(claims);
        AuthSession session = new AuthSession();
        session.setId(Ids.uuid("SESSION"));
        session.setActorType(claims.actorType());
        session.setActorId(claims.actorId());
        session.setRefreshTokenHash(hash(refresh));
        session.setAccessTokenHash(hash(access));
        session.setExpiresAt(Instant.now().plus(jwtProperties.getRefreshTokenTtl()));
        sessionMapper.insert(session);
        Profile profile = new Profile(claims.actorType(), claims.actorId(), claims.tenantId(), displayName,
                identity == null ? null : identity.getUserId(),
                identity == null ? null : ("disabled".equalsIgnoreCase(identity.getStatus()) ? "normal" : identity.getLevel()),
                identity == null ? null : identity.getLeaderId(), identity == null ? null : identity.getParentLeaderId(),
                claims.roles(), claims.permissions(), claims.supplierId(),
                "driver".equals(claims.actorType()) ? claims.actorId() : null,
                "store".equals(claims.actorType()) ? claims.subject() : null);
        return new TokenResponse(access, refresh, "Bearer", jwtProperties.getAccessTokenTtl().toSeconds(), profile);
    }

    private List<String> permissions(List<AuthRole> roles) {
        return roles.stream().flatMap(role -> {
            if (role.getPermissionsJson() == null || role.getPermissionsJson().isBlank()) return List.<String>of().stream();
            try {
                return objectMapper.readValue(role.getPermissionsJson(), new TypeReference<List<String>>() {}).stream();
            } catch (Exception exception) {
                return List.<String>of().stream();
            }
        }).distinct().toList();
    }

    private String hash(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }
}

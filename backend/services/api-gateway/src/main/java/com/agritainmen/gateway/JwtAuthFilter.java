package com.agritainmen.gateway;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Component
public class JwtAuthFilter implements GlobalFilter, Ordered {
    private static final List<String> PUBLIC_AUTH_PATHS = List.of(
            "/api/v1/auth/admin/login", "/api/v1/auth/store/login", "/api/v1/auth/supplier/login", "/api/v1/auth/driver/login",
            "/api/v1/auth/wechat/exchange", "/api/v1/auth/refresh", "/api/v1/auth/logout");
    private static final String TRACE_HEADER = "X-Trace-Id";
    private final SecretKey key;

    public JwtAuthFilter(@Value("${agritainmen.security.jwt.secret:${JWT_SECRET:change-me-at-least-32-bytes-long-secret}}") String secret) {
        byte[] bytes = secret.getBytes(StandardCharsets.UTF_8);
        if (bytes.length < 32) throw new IllegalArgumentException("JWT secret must be at least 32 bytes");
        this.key = Keys.hmacShaKeyFor(bytes);
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String path = exchange.getRequest().getURI().getPath();
        HttpMethod method = exchange.getRequest().getMethod();
        if ((method == HttpMethod.POST && PUBLIC_AUTH_PATHS.contains(path))
                || path.equals("/actuator/health") || path.equals("/actuator/info")) {
            return chain.filter(exchange.mutate().request(request -> request.headers(this::stripActorHeaders)).build());
        }
        String authorization = exchange.getRequest().getHeaders().getFirst(HttpHeaders.AUTHORIZATION);
        if (authorization == null || !authorization.startsWith("Bearer ")) return unauthorized(exchange, "UNAUTHORIZED");
        try {
            Claims claims = Jwts.parser().verifyWith(key).requireIssuer("agritainmen").build()
                    .parseSignedClaims(authorization.substring(7)).getPayload();
            if (!"access".equals(claims.get("tokenType", String.class))) return unauthorized(exchange, "TOKEN_INVALID");
            String actorType = claims.get("actorType", String.class);
            String actorId = claims.get("actorId", String.class);
            String tenantId = claims.get("tenantId", String.class);
            if (actorType == null || actorId == null || tenantId == null
                    || actorType.isBlank() || actorId.isBlank() || tenantId.isBlank()) return unauthorized(exchange, "TOKEN_INVALID");
            if (requiresPlatformAdmin(path) && (!"admin".equals(actorType) || !"PLATFORM".equals(tenantId)
                    || !permitted(path, method, claims.get("permissions")))) return forbidden(exchange);
            ServerWebExchange mutated = exchange.mutate().request(request -> request.headers(headers -> {
                stripActorHeaders(headers);
                headers.set("X-Actor-Type", actorType);
                headers.set("X-Actor-Id", actorId);
                headers.set("X-Tenant-Id", tenantId);
            })).build();
            return chain.filter(mutated);
        } catch (Exception exception) {
            return unauthorized(exchange, "TOKEN_INVALID");
        }
    }

    private void stripActorHeaders(HttpHeaders headers) {
        List.copyOf(headers.headerNames()).stream()
                .filter(name -> name.regionMatches(true, 0, "X-Actor", 0, 7))
                .forEach(headers::remove);
        headers.remove("X-Tenant-Id");
    }

    private boolean requiresPlatformAdmin(String path) {
        return path.startsWith("/api/v1/org/suppliers") || path.startsWith("/api/v1/org/farms")
                || path.startsWith("/api/v1/org/media") || path.startsWith("/api/v1/org/drivers")
                || path.startsWith("/api/v1/auth/admin/");
    }

    private boolean permitted(String path, HttpMethod method, Object rawPermissions) {
        if (!(rawPermissions instanceof List<?> permissions)) return false;
        if (permissions.contains("*")) return true;
        if (path.startsWith("/api/v1/org/drivers")) return method == HttpMethod.GET
                ? hasSupplierPermission(permissions) : permissions.contains("supplier.account.update");
        if (path.startsWith("/api/v1/org/media")) {
            return method == HttpMethod.GET ? hasSupplierPermission(permissions) || permissions.contains("farm.manage")
                    : method == HttpMethod.POST && (permissions.contains("supplier.create")
                    || permissions.contains("supplier.update") || permissions.contains("farm.manage"));
        }
        if (path.startsWith("/api/v1/org/farms")) return permissions.contains("farm.manage");
        if (path.startsWith("/api/v1/org/suppliers")) {
            if (method == HttpMethod.GET) return hasSupplierPermission(permissions);
            if (path.matches("/api/v1/org/suppliers/[^/]+/(audit|restore)")) return permissions.contains("supplier.audit");
            if (path.matches("/api/v1/org/suppliers/[^/]+/(pause|resume)")) return permissions.contains("supplier.pause");
            if (method == HttpMethod.POST && path.equals("/api/v1/org/suppliers")) return permissions.contains("supplier.create");
            return method == HttpMethod.PUT && path.matches("/api/v1/org/suppliers/[^/]+") && permissions.contains("supplier.update");
        }
        if (path.startsWith("/api/v1/auth/admin/supplier-accounts")) {
            if (method == HttpMethod.GET) return hasSupplierPermission(permissions);
            if (method == HttpMethod.POST) return permissions.contains("supplier.audit");
            if (path.endsWith("/freeze") || path.endsWith("/unfreeze")) return permissions.contains("supplier.account.freeze");
            if (method == HttpMethod.PATCH) return permissions.contains("supplier.account.update")
                    || permissions.contains("supplier.account.freeze");
            return method == HttpMethod.PUT && permissions.contains("supplier.account.update");
        }
        if (path.startsWith("/api/v1/auth/admin/roles")) {
            if (method == HttpMethod.GET) return permissions.stream().anyMatch(value -> value instanceof String code && code.startsWith("admin.role."));
            if (method == HttpMethod.POST) return permissions.contains("admin.role.create");
            if (method == HttpMethod.PUT) return path.endsWith("/permissions")
                    ? permissions.contains("admin.role.permissions") : permissions.contains("admin.role.update");
            return false;
        }
        if (path.startsWith("/api/v1/auth/admin/accounts")) {
            if (method == HttpMethod.GET) return permissions.stream().anyMatch(value -> value instanceof String code && code.startsWith("admin.account."));
            if (method == HttpMethod.POST) return permissions.contains("admin.account.create");
            return (method == HttpMethod.PUT || method == HttpMethod.PATCH)
                    && (permissions.contains("admin.account.update") || permissions.contains("admin.account.status"));
        }
        return true;
    }

    private boolean hasSupplierPermission(List<?> permissions) {
        return permissions.stream().anyMatch(value -> value instanceof String code && code.startsWith("supplier."));
    }

    private Mono<Void> forbidden(ServerWebExchange exchange) {
        return error(exchange, HttpStatus.FORBIDDEN, "FORBIDDEN", "无权限执行此操作");
    }

    private Mono<Void> unauthorized(ServerWebExchange exchange, String code) {
        return error(exchange, HttpStatus.UNAUTHORIZED, code, "未登录或登录已失效");
    }

    private Mono<Void> error(ServerWebExchange exchange, HttpStatus status, String code, String message) {
        String traceId = exchange.getRequest().getHeaders().getFirst(TRACE_HEADER);
        if (traceId == null || traceId.isBlank()) traceId = UUID.randomUUID().toString().replace("-", "");
        exchange.getResponse().setStatusCode(status);
        exchange.getResponse().getHeaders().setContentType(MediaType.APPLICATION_JSON);
        exchange.getResponse().getHeaders().set(TRACE_HEADER, traceId);
        String body = "{\"code\":\"" + code + "\",\"message\":\"" + message + "\",\"data\":null,\"traceId\":\"" + traceId + "\",\"timestamp\":\"" + Instant.now() + "\"}";
        return exchange.getResponse().writeWith(Mono.just(exchange.getResponse().bufferFactory().wrap(body.getBytes(StandardCharsets.UTF_8))));
    }

    @Override
    public int getOrder() {
        return -100;
    }
}

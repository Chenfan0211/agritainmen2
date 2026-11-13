package com.agritainmen.auth.config;

import com.agritainmen.auth.service.AuthService;
import com.agritainmen.common.core.ApiResponse;
import com.agritainmen.common.core.BusinessException;
import com.agritainmen.common.core.ErrorCode;
import com.agritainmen.common.security.TokenClaims;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import tools.jackson.databind.json.JsonMapper;

final class AdminTokenFilter extends OncePerRequestFilter {
    private final AuthService authService;
    private final JdbcTemplate jdbc;
    private final JsonMapper json;

    AdminTokenFilter(AuthService authService, JdbcTemplate jdbc, JsonMapper json) {
        this.authService = authService;
        this.jdbc = jdbc;
        this.json = json;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getServletPath();
        return !path.startsWith("/api/v1/auth/admin/") || path.equals("/api/v1/auth/admin/login");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header == null || !header.startsWith("Bearer ")) {
            reject(response, HttpServletResponse.SC_UNAUTHORIZED, ErrorCode.UNAUTHORIZED);
            return;
        }
        TokenClaims claims;
        try {
            claims = authService.verifyAccessToken(header.substring(7));
        } catch (BusinessException invalidToken) {
            reject(response, HttpServletResponse.SC_UNAUTHORIZED, ErrorCode.UNAUTHORIZED);
            return;
        }
        if (!"admin".equals(claims.actorType()) || !"PLATFORM".equals(claims.tenantId())) {
            reject(response, HttpServletResponse.SC_FORBIDDEN, ErrorCode.FORBIDDEN);
            return;
        }
        Integer active = jdbc.queryForObject("""
                select count(*) from auth_account where id=? and actor_type='admin' and tenant_id=? and enabled=true and deleted=false
                """, Integer.class, claims.actorId(), claims.tenantId());
        if (active == null || active != 1) {
            reject(response, HttpServletResponse.SC_UNAUTHORIZED, ErrorCode.UNAUTHORIZED);
            return;
        }
        if (!permitted(request, claims)) {
            reject(response, HttpServletResponse.SC_FORBIDDEN, ErrorCode.FORBIDDEN);
            return;
        }
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(claims, null, List.of()));
        chain.doFilter(request, response);
    }

    private boolean permitted(HttpServletRequest request, TokenClaims claims) {
        String path = request.getServletPath();
        String method = request.getMethod();
        List<String> permissions = claims.permissions() == null ? List.of() : claims.permissions();
        if (permissions.contains("*")) return true;
        if (path.startsWith("/api/v1/auth/admin/supplier-accounts")) {
            return switch (method) {
                case "GET" -> permissions.stream().anyMatch(code -> code.startsWith("supplier."));
                case "POST" -> permissions.contains("supplier.audit");
                case "PATCH" -> permissions.contains("supplier.account.update") || permissions.contains("supplier.account.freeze");
                default -> false;
            };
        }
        if (path.startsWith("/api/v1/auth/admin/roles")) {
            return switch (method) {
                case "GET" -> permissions.stream().anyMatch(code -> code.startsWith("admin.role."));
                case "POST" -> permissions.contains("admin.role.create");
                case "PUT" -> path.endsWith("/permissions") ? permissions.contains("admin.role.permissions")
                        : permissions.contains("admin.role.update");
                default -> false;
            };
        }
        if (path.startsWith("/api/v1/auth/admin/accounts")) {
            return switch (method) {
                case "GET" -> permissions.stream().anyMatch(code -> code.startsWith("admin.account."));
                case "POST" -> permissions.contains("admin.account.create");
                case "PUT", "PATCH" -> permissions.contains("admin.account.update") || permissions.contains("admin.account.status");
                default -> false;
            };
        }
        return false;
    }

    private void reject(HttpServletResponse response, int status, ErrorCode code) throws IOException {
        response.setStatus(status);
        response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write(json.writeValueAsString(ApiResponse.fail(code.code(), code.defaultMessage())));
    }
}

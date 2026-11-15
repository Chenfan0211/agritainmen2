package com.agritainmen.org;

import com.agritainmen.common.security.JwtService;
import com.agritainmen.common.security.TokenClaims;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.io.ByteArrayInputStream;
import java.io.InputStreamReader;
import java.io.BufferedReader;
import java.nio.charset.StandardCharsets;
import java.util.List;
import tools.jackson.databind.ObjectMapper;

@Configuration(proxyBeanMethods = false)
public class OrgSecurityConfiguration {
    @Bean
    @ConditionalOnProperty(name = "agritainmen.security.org.enabled", havingValue = "true", matchIfMissing = true)
    SecurityFilterChain orgSecurityFilterChain(HttpSecurity http, JwtService jwtService,
                                               JdbcTemplate jdbc, ObjectMapper objectMapper) throws Exception {
        return http.csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth.anyRequest().permitAll())
                .addFilterBefore(new OrgAuthorizationFilter(jwtService, jdbc, objectMapper), UsernamePasswordAuthenticationFilter.class)
                .build();
    }

    private static final class OrgAuthorizationFilter extends OncePerRequestFilter {
        private final JwtService jwtService;
        private final JdbcTemplate jdbc;
        private final ObjectMapper objectMapper;

        private OrgAuthorizationFilter(JwtService jwtService, JdbcTemplate jdbc, ObjectMapper objectMapper) {
            this.jwtService = jwtService;
            this.jdbc = jdbc;
            this.objectMapper = objectMapper;
        }

        @Override
        protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
                throws ServletException, IOException {
            String path = request.getRequestURI();
            if (!path.startsWith("/api/v1/org/")) {
                chain.doFilter(request, response);
                return;
            }
            String authorization = request.getHeader(HttpHeaders.AUTHORIZATION);
            if (authorization == null || !authorization.startsWith("Bearer ")) {
                response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                return;
            }
            TokenClaims claims;
            try {
                String token = authorization.substring(7);
                claims = jwtService.parse(token);
                if (jwtService.isRefreshToken(token) || claims.actorId() == null || claims.actorId().isBlank()) {
                    response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                    return;
                }
            } catch (Exception exception) {
                response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                return;
            }
            if (!permitted(path, request.getMethod(), claims)) {
                response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                return;
            }
            HttpServletRequest forwarded = request;
            if (path.startsWith("/api/v1/org/media")) {
                if ("GET".equals(request.getMethod()) && !canReadMedia(path, claims.permissions())) {
                    response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                    return;
                }
                if ("POST".equals(request.getMethod())) {
                    byte[] body = request.getInputStream().readNBytes(4 * 1024 * 1024 + 1);
                    if (body.length > 4 * 1024 * 1024) {
                        response.setStatus(HttpServletResponse.SC_REQUEST_ENTITY_TOO_LARGE);
                        return;
                    }
                    forwarded = new CachedBodyRequest(request, body);
                    if (!canUploadMedia(body, claims.permissions())) {
                        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                        return;
                    }
                }
            }
            chain.doFilter(forwarded, response);
        }

        private boolean canReadMedia(String path, List<String> permissions) {
            if (permissions.contains("*")) return true;
            if (!path.startsWith("/api/v1/org/media/")) return true;
            String id = path.substring("/api/v1/org/media/".length());
            if (id.isBlank() || id.contains("/")) return true;
            List<String> purposes = jdbc.queryForList(
                    "select purpose from org_media where id=? and tenant_id='PLATFORM'", String.class, id);
            return purposes.isEmpty() || purposeAllowed(purposes.getFirst(), permissions, false);
        }

        private boolean canUploadMedia(byte[] body, List<String> permissions) {
            if (permissions.contains("*")) return true;
            try {
                String purpose = objectMapper.readTree(body).path("purpose").asText();
                return purpose.isBlank() || purposeAllowed(purpose, permissions, true);
            } catch (Exception invalidBody) {
                return true; // Let the controller report malformed JSON.
            }
        }

        private boolean purposeAllowed(String purpose, List<String> permissions, boolean upload) {
            return switch (purpose) {
                case "supplier-business-license", "supplier-permit" -> upload
                        ? permissions.contains("supplier.create") || permissions.contains("supplier.update")
                        : hasSupplierPermission(permissions);
                case "farm-cover" -> permissions.contains("farm.manage");
                default -> upload; // Unknown upload purposes are rejected by the media controller.
            };
        }

        private boolean permitted(String path, String method, TokenClaims claims) {
            if (!path.startsWith("/api/v1/org/suppliers") && !path.startsWith("/api/v1/org/farms")
                    && !path.startsWith("/api/v1/org/farm-accounts")
                    && !path.startsWith("/api/v1/org/media") && !path.startsWith("/api/v1/org/drivers")) return true;
            if ("GET".equals(method) && path.matches("/api/v1/org/farm-accounts/[^/]+")
                    && "service".equals(claims.actorType()) && "auth-service".equals(claims.actorId())
                    && "PLATFORM".equals(claims.tenantId()) && claims.permissions() != null
                    && claims.permissions().contains("farm-account.inspect")) return true;
            if (!"admin".equals(claims.actorType()) || !"PLATFORM".equals(claims.tenantId())) return false;
            List<String> permissions = claims.permissions();
            if (permissions == null) return false;
            if (permissions.contains("*")) return true;
            if (path.startsWith("/api/v1/org/drivers")) return "GET".equals(method)
                    ? hasSupplierPermission(permissions) : permissions.contains("supplier.account.update");
            if (path.startsWith("/api/v1/org/media")) {
                return "GET".equals(method) ? hasSupplierPermission(permissions) || permissions.contains("farm.manage")
                        : "POST".equals(method) && (permissions.contains("supplier.create")
                        || permissions.contains("supplier.update") || permissions.contains("farm.manage"));
            }
            if (path.startsWith("/api/v1/org/farms") || path.startsWith("/api/v1/org/farm-accounts"))
                return permissions.contains("farm.manage");
            if ("GET".equals(method)) return hasSupplierPermission(permissions);
            if (path.matches("/api/v1/org/suppliers/[^/]+/(audit|restore)")) return permissions.contains("supplier.audit");
            if (path.matches("/api/v1/org/suppliers/[^/]+/(pause|resume)")) return permissions.contains("supplier.pause");
            if ("POST".equals(method) && path.equals("/api/v1/org/suppliers")) return permissions.contains("supplier.create");
            return "PUT".equals(method) && path.matches("/api/v1/org/suppliers/[^/]+") && permissions.contains("supplier.update");
        }

        private boolean hasSupplierPermission(List<String> permissions) {
            return permissions.stream().anyMatch(code -> code != null && code.startsWith("supplier."));
        }
    }

    private static final class CachedBodyRequest extends HttpServletRequestWrapper {
        private final byte[] body;

        private CachedBodyRequest(HttpServletRequest request, byte[] body) {
            super(request);
            this.body = body;
        }

        @Override public int getContentLength() { return body.length; }
        @Override public long getContentLengthLong() { return body.length; }
        @Override public BufferedReader getReader() {
            return new BufferedReader(new InputStreamReader(new ByteArrayInputStream(body), StandardCharsets.UTF_8));
        }
        @Override public ServletInputStream getInputStream() {
            ByteArrayInputStream stream = new ByteArrayInputStream(body);
            return new ServletInputStream() {
                @Override public int read() { return stream.read(); }
                @Override public boolean isFinished() { return stream.available() == 0; }
                @Override public boolean isReady() { return true; }
                @Override public void setReadListener(ReadListener listener) { }
            };
        }
    }
}

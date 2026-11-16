package com.agritainmen.catalog;

import com.agritainmen.common.web.RemoteAdminVerifier;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration(proxyBeanMethods = false)
public class CatalogSecurityConfiguration {
    @Bean
    RemoteAdminVerifier catalogAdminVerifier(
            @Value("${agritainmen.clients.auth.base-url:http://127.0.0.1:8081}") String authBaseUrl) {
        return new RemoteAdminVerifier(authBaseUrl);
    }

    @Bean
    SecurityFilterChain catalogSecurityFilterChain(HttpSecurity http) throws Exception {
        return http.csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/api/v1/catalog/**", "/actuator/health/**", "/actuator/info").permitAll()
                        .anyRequest().denyAll())
                .build();
    }

    @Bean
    WebMvcConfigurer catalogWriteGuard(RemoteAdminVerifier verifier) {
        return new WebMvcConfigurer() {
            @Override
            public void addInterceptors(InterceptorRegistry registry) {
                registry.addInterceptor(new HandlerInterceptor() {
                    @Override
                    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
                        if (!"GET".equals(request.getMethod()))
                            verifier.requireAdmin(request.getHeader("Authorization"));
                        return true;
                    }
                }).addPathPatterns("/api/v1/catalog/**");
            }
        };
    }
}

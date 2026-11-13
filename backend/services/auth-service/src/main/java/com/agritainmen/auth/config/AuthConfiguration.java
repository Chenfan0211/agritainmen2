package com.agritainmen.auth.config;

import com.agritainmen.auth.service.AuthService;
import com.agritainmen.auth.web.WechatExchangeClient;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.json.JsonMapper;

@Configuration
@EnableConfigurationProperties(WechatProperties.class)
public class AuthConfiguration {
    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(12);
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http, AuthService authService, JdbcTemplate jdbc, JsonMapper json) throws Exception {
        return http
                .csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/api/v1/auth/admin/login").permitAll()
                        .requestMatchers("/api/v1/auth/admin/**").authenticated()
                        .requestMatchers("/api/v1/auth/**", "/actuator/health/**", "/actuator/info", "/v3/api-docs/**", "/swagger-ui/**").permitAll()
                        .anyRequest().authenticated())
                .addFilterBefore(new AdminTokenFilter(authService, jdbc, json), UsernamePasswordAuthenticationFilter.class)
                .build();
    }

    @Bean
    public WechatExchangeClient wechatExchangeClient(WechatProperties properties) {
        return new WechatExchangeClient(properties);
    }
}

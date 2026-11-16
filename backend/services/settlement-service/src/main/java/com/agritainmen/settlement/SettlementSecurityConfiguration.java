package com.agritainmen.settlement;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;

@Configuration(proxyBeanMethods = false)
public class SettlementSecurityConfiguration {
    @Bean
    SecurityFilterChain settlementSecurityFilterChain(HttpSecurity http) throws Exception {
        return http.csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/api/v1/commissions", "/api/v1/commissions/**",
                                "/api/v1/withdrawals", "/api/v1/withdrawals/**",
                                "/actuator/health", "/actuator/health/**", "/actuator/info").permitAll()
                        .anyRequest().denyAll())
                .build();
    }
}

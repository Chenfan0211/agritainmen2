package com.agritainmen.order;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = "agritainmen.security.order-source.enabled", havingValue = "true", matchIfMissing = true)
public class OrderSourceSecurityConfiguration {
    @Bean
    @Order(1)
    SecurityFilterChain fulfillmentSourceChain(HttpSecurity http) throws Exception {
        return http.securityMatcher("/api/v1/orders/*/fulfillment-source")
                .csrf(csrf -> csrf.disable())
                .authorizeHttpRequests(auth -> auth.anyRequest().permitAll())
                .build();
    }

    @Bean
    @Order(2)
    SecurityFilterChain otherOrdersChain(HttpSecurity http) throws Exception {
        return http.securityMatcher("/api/v1/orders/**", "/api/v1/after-sales", "/api/v1/after-sales/**")
                .csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth.anyRequest().permitAll()).build();
    }

    @Bean
    @Order(3)
    SecurityFilterChain otherPathsChain(HttpSecurity http) throws Exception {
        return http.authorizeHttpRequests(auth -> auth
                        .requestMatchers("/actuator/health", "/actuator/health/**", "/actuator/info").permitAll()
                        .anyRequest().authenticated())
                .httpBasic(Customizer.withDefaults()).build();
    }
}

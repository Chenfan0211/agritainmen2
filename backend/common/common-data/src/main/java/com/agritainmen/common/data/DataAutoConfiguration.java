package com.agritainmen.common.data;

import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.context.annotation.Bean;

@AutoConfiguration
public class DataAutoConfiguration {
    @Bean
    public IdempotencyService idempotencyService(IdempotencyMapper mapper) {
        return new IdempotencyService(mapper);
    }
}

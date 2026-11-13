package com.agritainmen.common.event;

import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.context.annotation.Bean;

@AutoConfiguration
public class EventAutoConfiguration {
    @Bean
    public OutboxService outboxService(OutboxMapper mapper) {
        return new OutboxService(mapper);
    }
}

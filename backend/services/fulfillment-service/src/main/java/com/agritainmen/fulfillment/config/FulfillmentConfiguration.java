package com.agritainmen.fulfillment.config;

import com.agritainmen.fulfillment.provider.LogisticsProvider;
import com.agritainmen.fulfillment.provider.SandboxLogisticsProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class FulfillmentConfiguration {
    @Bean
    public LogisticsProvider logisticsProvider() {
        return new SandboxLogisticsProvider();
    }
}

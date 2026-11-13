package com.agritainmen.notification.config;

import com.agritainmen.notification.provider.SandboxSmsProvider;
import com.agritainmen.notification.provider.SmsProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class NotificationConfiguration {
    @Bean
    public SmsProvider smsProvider() {
        return new SandboxSmsProvider();
    }
}

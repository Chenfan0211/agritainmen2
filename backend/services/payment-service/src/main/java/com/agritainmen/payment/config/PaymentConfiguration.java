package com.agritainmen.payment.config;

import com.agritainmen.payment.provider.PaymentProvider;
import com.agritainmen.payment.provider.SandboxPaymentProvider;
import com.agritainmen.payment.provider.WechatV3PaymentProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class PaymentConfiguration {
    @Bean
    public PaymentProvider paymentProvider(@Value("${agritainmen.payment.provider:sandbox}") String provider) {
        return "wechat-v3".equalsIgnoreCase(provider) ? new WechatV3PaymentProvider() : new SandboxPaymentProvider();
    }
}

package com.agritainmen.notification.provider;

public interface SmsProvider {
    SendResult sendVerificationCode(String phone);
    boolean verify(String phone, String code);
    record SendResult(String provider, String requestId, String testCode) {}
}

package com.agritainmen.notification.provider;

import com.agritainmen.common.core.Ids;

public class SandboxSmsProvider implements SmsProvider {
    public static final String TEST_CODE = "123456";
    @Override
    public SendResult sendVerificationCode(String phone) {
        return new SendResult("sandbox", Ids.uuid("SMS"), TEST_CODE);
    }
    @Override
    public boolean verify(String phone, String code) {
        return TEST_CODE.equals(code);
    }
}

package com.agritainmen.notification.web;

import com.agritainmen.common.core.ApiResponse;
import com.agritainmen.notification.provider.SmsProvider;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/notifications")
public class NotificationController {
    private final SmsProvider smsProvider;
    public NotificationController(SmsProvider smsProvider) { this.smsProvider = smsProvider; }
    public record SendCodeRequest(@NotBlank String phone) {}
    public record VerifyCodeRequest(@NotBlank String phone, @NotBlank String code) {}

    @GetMapping("/health")
    public ApiResponse<Map<String, String>> health() { return ApiResponse.ok(Map.of("status", "UP", "channel", "rabbitmq")); }

    @PostMapping("/sms/verification-code")
    public ApiResponse<SmsProvider.SendResult> sendCode(@Valid @RequestBody SendCodeRequest request) { return ApiResponse.ok(smsProvider.sendVerificationCode(request.phone())); }

    @PostMapping("/sms/verify")
    public ApiResponse<Boolean> verify(@Valid @RequestBody VerifyCodeRequest request) { return ApiResponse.ok(smsProvider.verify(request.phone(), request.code())); }
}

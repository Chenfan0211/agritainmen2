package com.agritainmen.payment.web;

import com.agritainmen.common.core.ApiResponse;
import com.agritainmen.common.core.BusinessException;
import com.agritainmen.common.core.ErrorCode;
import com.agritainmen.payment.service.PaymentService;
import com.agritainmen.payment.web.PaymentDtos.CallbackRequest;
import com.agritainmen.payment.web.PaymentDtos.CreateIntentRequest;
import com.agritainmen.payment.web.PaymentDtos.PaymentView;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@RestController
@RequestMapping("/api/v1/payments")
public class PaymentController {
    private final PaymentService paymentService;
    private final String callbackToken;

    public PaymentController(PaymentService paymentService,
            @Value("${agritainmen.payment.callback-token:}") String callbackToken) {
        this.paymentService = paymentService;
        this.callbackToken = callbackToken;
    }

    @PostMapping("/intents")
    public ApiResponse<PaymentView> create(@Valid @RequestBody CreateIntentRequest request,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        return ApiResponse.ok(paymentService.create(request.orderId(), request.amountCents(), request.channel(), authorization));
    }

    @PostMapping("/callback/wechat")
    public ApiResponse<PaymentView> callback(@Valid @RequestBody CallbackRequest request,
            @RequestHeader(value = "X-Payment-Callback-Token", required = false) String token) {
        if (callbackToken == null || callbackToken.isBlank())
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "支付回调令牌未配置");
        if (token == null || !MessageDigest.isEqual(callbackToken.getBytes(StandardCharsets.UTF_8), token.getBytes(StandardCharsets.UTF_8)))
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        return ApiResponse.ok(paymentService.callback(request));
    }

    @GetMapping("/orders/{orderId}")
    public ApiResponse<PaymentView> byOrder(@PathVariable String orderId,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        PaymentView payment = paymentService.findForBuyer(orderId, authorization);
        if (payment == null) throw new BusinessException(ErrorCode.NOT_FOUND, "支付单不存在");
        return ApiResponse.ok(payment);
    }
}

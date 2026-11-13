package com.agritainmen.payment.web;

import com.agritainmen.common.core.ApiResponse;
import com.agritainmen.common.core.BusinessException;
import com.agritainmen.common.core.ErrorCode;
import com.agritainmen.payment.service.PaymentService;
import com.agritainmen.payment.web.PaymentDtos.CallbackRequest;
import com.agritainmen.payment.web.PaymentDtos.CreateIntentRequest;
import com.agritainmen.payment.web.PaymentDtos.PaymentView;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/payments")
public class PaymentController {
    private final PaymentService paymentService;

    public PaymentController(PaymentService paymentService) {
        this.paymentService = paymentService;
    }

    @PostMapping("/intents")
    public ApiResponse<PaymentView> create(@Valid @RequestBody CreateIntentRequest request) {
        return ApiResponse.ok(paymentService.create(request.orderId(), request.amountCents(), request.channel()));
    }

    @PostMapping("/callback/wechat")
    public ApiResponse<PaymentView> callback(@Valid @RequestBody CallbackRequest request) {
        return ApiResponse.ok(paymentService.callback(request));
    }

    @GetMapping("/orders/{orderId}")
    public ApiResponse<PaymentView> byOrder(@PathVariable String orderId) {
        PaymentView payment = paymentService.findByOrder(orderId);
        if (payment == null) throw new BusinessException(ErrorCode.NOT_FOUND, "支付单不存在");
        return ApiResponse.ok(payment);
    }
}

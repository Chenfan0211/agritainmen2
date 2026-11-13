package com.agritainmen.payment.web;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.Instant;

public final class PaymentDtos {
    private PaymentDtos() {}
    public record CreateIntentRequest(@NotBlank String orderId, @NotNull @Min(1) Long amountCents, @NotBlank String channel) {}
    public record CallbackRequest(@NotBlank String provider, @NotBlank String providerTxnId, @NotBlank String orderId, boolean success, String failureReason) {}
    public record PaymentView(String id, String orderId, long amountCents, String channel, String status, String providerTxnId, Instant createdAt, Instant paidAt) {}
}

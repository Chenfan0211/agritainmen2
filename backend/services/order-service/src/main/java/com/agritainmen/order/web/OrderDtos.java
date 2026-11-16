package com.agritainmen.order.web;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.time.Instant;
import java.util.List;

public final class OrderDtos {
    private OrderDtos() {}
    public record OrderLineRequest(@NotBlank String skuId, @NotNull @Min(1) Integer quantity) {}
    public record CreateOrderRequest(@NotBlank String buyerId, @NotEmpty List<@Valid OrderLineRequest> items,
                                     @NotBlank String receiver, @NotBlank String receiverPhone, @NotBlank String address) {}
    public record OrderLineView(String skuId, String productId, String supplierId, String name, long unitPriceCents, int quantity, long amountCents) {}
    public record OrderView(String id, String orderNo, String buyerId, String status, long amountCents, String reservationId,
                            String receiver, String receiverPhone, String address, List<OrderLineView> items, Instant createdAt) {}
    public record PriceQuote(String skuId, String productId, String supplierId, String name, long unitPriceCents) {}
    public record PaymentConfirmationRequest(@NotNull @Min(1) Long amountCents) {}
}

package com.agritainmen.inventory.web;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.time.Instant;
import java.util.List;

public final class InventoryDtos {
    private InventoryDtos() {}
    public record ReserveLine(@NotBlank String skuId, @NotNull @Min(1) Integer quantity) {}
    public record ReserveRequest(@NotBlank String orderId, @NotEmpty List<@Valid ReserveLine> items, Instant expiresAt) {}
    public record AdjustRequest(@NotNull Integer delta, @NotBlank String reason) {}
    public record ReservationView(String id, String orderId, String status, List<ReserveLine> items, Instant expiresAt, Instant createdAt) {}
}

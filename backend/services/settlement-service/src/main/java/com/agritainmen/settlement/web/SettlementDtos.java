package com.agritainmen.settlement.web;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.Instant;

public final class SettlementDtos {
    private SettlementDtos() {}
    public record AddCommissionRequest(@NotBlank String sourceId, @NotBlank String beneficiaryId, @NotNull @Min(1) Long amountCents, @NotBlank String direction) {}
    public record WithdrawalRequest(@NotBlank String requesterId, @NotNull @Min(1) Long amountCents, @NotBlank String method) {}
    public record ReviewRequest(boolean approved, String operator, String note) {}
    public record CommissionView(String id, String sourceId, String beneficiaryId, long amountCents, String direction, String status, Instant createdAt) {}
    public record WithdrawalView(String id, String requesterId, long amountCents, String method, String status, String reviewedBy, Instant createdAt, Instant reviewedAt) {}
}

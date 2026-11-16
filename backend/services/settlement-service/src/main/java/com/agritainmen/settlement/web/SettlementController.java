package com.agritainmen.settlement.web;

import com.agritainmen.common.core.ApiResponse;
import com.agritainmen.common.core.BusinessException;
import com.agritainmen.common.core.ErrorCode;
import com.agritainmen.settlement.service.SettlementService;
import com.agritainmen.settlement.web.SettlementDtos.AddCommissionRequest;
import com.agritainmen.settlement.web.SettlementDtos.CommissionView;
import com.agritainmen.settlement.web.SettlementDtos.ReviewRequest;
import com.agritainmen.settlement.web.SettlementDtos.WithdrawalRequest;
import com.agritainmen.settlement.web.SettlementDtos.WithdrawalView;
import jakarta.validation.Valid;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1")
public class SettlementController {
    private final SettlementService settlementService;
    private final JdbcTemplate jdbc;
    private final SettlementAccessVerifier accessVerifier;

    public SettlementController(SettlementService settlementService, JdbcTemplate jdbc,
                                SettlementAccessVerifier accessVerifier) {
        this.settlementService = settlementService;
        this.jdbc = jdbc;
        this.accessVerifier = accessVerifier;
    }

    @PostMapping("/commissions")
    public ApiResponse<CommissionView> addCommission(@Valid @RequestBody AddCommissionRequest request,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        accessVerifier.requireAdmin(authorization, "commission.manage");
        return ApiResponse.ok(settlementService.addCommission(request.sourceId(), request.beneficiaryId(), request.amountCents(), request.direction()));
    }

    @GetMapping("/commissions")
    public ApiResponse<PageView> commissions(@RequestParam(required = false) String beneficiaryId,
                                             @RequestParam(defaultValue = "1") int page,
                                             @RequestParam(defaultValue = "20") int pageSize,
                                             @RequestHeader(value = "Authorization", required = false) String authorization) {
        accessVerifier.requireAdmin(authorization, "commission.manage");
        if (page < 1 || pageSize < 1 || pageSize > 200) throw new BusinessException(ErrorCode.BAD_REQUEST, "page 必须大于 0，pageSize 必须在 1-200 之间");
        String normalized = beneficiaryId == null ? "" : beneficiaryId.trim();
        String where = normalized.isBlank() ? " where tenant_id='PLATFORM' and deleted=false"
                : " where tenant_id='PLATFORM' and deleted=false and beneficiary_id=?";
        Object[] args = normalized.isBlank() ? new Object[0] : new Object[]{normalized};
        Long total = jdbc.queryForObject("select count(*) from settlement_commission" + where, Long.class, args);
        Object[] pageArgs = new Object[args.length + 2];
        System.arraycopy(args, 0, pageArgs, 0, args.length);
        pageArgs[args.length] = pageSize;
        pageArgs[args.length + 1] = (page - 1) * pageSize;
        List<Map<String, Object>> items = jdbc.queryForList("select id, source_id, beneficiary_id, amount_cents, direction, status, created_at from settlement_commission" + where + " order by created_at, id limit ? offset ?", pageArgs);
        return ApiResponse.ok(new PageView(items, page, pageSize, total == null ? 0 : total));
    }

    @GetMapping("/commissions/me")
    public ApiResponse<MineView> mine(@RequestParam String beneficiaryId,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        String id = beneficiaryId == null ? "" : beneficiaryId.trim();
        if (id.isBlank()) throw new BusinessException(ErrorCode.BAD_REQUEST, "beneficiaryId 不能为空");
        accessVerifier.requireBeneficiary(authorization, id);
        long available = settlementService.availableForWithdrawal(id);
        long pending = jdbc.queryForObject("select coalesce(sum(amount_cents),0) from settlement_commission where tenant_id='PLATFORM' and beneficiary_id=? and status='PENDING' and deleted=false", Long.class, id);
        long withdrawn = jdbc.queryForObject("select coalesce(sum(amount_cents),0) from settlement_commission where tenant_id='PLATFORM' and beneficiary_id=? and status='WITHDRAWN' and deleted=false", Long.class, id)
                + settlementService.approvedWithdrawalCents(id);
        return ApiResponse.ok(new MineView(id, available, pending, withdrawn));
    }

    @GetMapping("/withdrawals/me")
    public ApiResponse<List<WithdrawalView>> myWithdrawals(@RequestParam String requesterId,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        String id = requesterId == null ? "" : requesterId.trim();
        if (id.isBlank()) throw new BusinessException(ErrorCode.BAD_REQUEST, "requesterId 不能为空");
        accessVerifier.requireBeneficiary(authorization, id);
        return ApiResponse.ok(settlementService.listWithdrawals(id));
    }

    @GetMapping("/withdrawals")
    public ApiResponse<List<WithdrawalView>> withdrawals(@RequestParam(required = false) String requesterId,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        accessVerifier.requireAdmin(authorization, "withdrawal.review", "leader.withdrawal.review");
        return ApiResponse.ok(settlementService.listWithdrawalsForAdmin(requesterId == null ? "" : requesterId.trim()));
    }

    @PostMapping("/withdrawals")
    public ApiResponse<WithdrawalView> requestWithdrawal(@Valid @RequestBody WithdrawalRequest request,
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey) {
        accessVerifier.requireBeneficiary(authorization, request.requesterId());
        return ApiResponse.ok(settlementService.requestWithdrawal(request.requesterId(), request.amountCents(), request.method(), idempotencyKey));
    }

    @PostMapping("/withdrawals/{id}/review")
    public ApiResponse<WithdrawalView> review(@PathVariable String id, @Valid @RequestBody ReviewRequest request,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        String operatorId = accessVerifier.requireAdmin(authorization, "withdrawal.review", "leader.withdrawal.review").actorId();
        return ApiResponse.ok(settlementService.reviewWithdrawal(id, request.approved(), operatorId, request.note()));
    }

    public record PageView(List<Map<String, Object>> items, int page, int pageSize, long total) {}
    public record MineView(String beneficiaryId, long availableCents, long pendingCents, long withdrawnCents) {}
}

package com.agritainmen.settlement.service;

import com.agritainmen.common.core.BusinessException;
import com.agritainmen.common.core.ErrorCode;
import com.agritainmen.common.core.Ids;
import com.agritainmen.common.event.OutboxService;
import com.agritainmen.settlement.web.SettlementDtos.CommissionView;
import com.agritainmen.settlement.web.SettlementDtos.WithdrawalView;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;

@Service
public class SettlementService {
    private final JdbcTemplate jdbc;
    private final OutboxService outboxService;

    public SettlementService(JdbcTemplate jdbc, OutboxService outboxService) {
        this.jdbc = jdbc;
        this.outboxService = outboxService;
    }

    @Transactional
    public CommissionView addCommission(String sourceId, String beneficiaryId, long amountCents, String direction) {
        if (amountCents <= 0) throw new BusinessException(ErrorCode.BAD_REQUEST, "佣金必须大于 0");
        CommissionView existing = findCommission(sourceId, beneficiaryId);
        if (existing != null) return existing;
        String id = Ids.uuid("COMMISSION");
        Instant now = Instant.now();
        try {
            jdbc.update("""
                    insert into settlement_commission(id, tenant_id, source_id, beneficiary_id, amount_cents, direction, status, created_at, updated_at, version, deleted)
                    values (?, 'PLATFORM', ?, ?, ?, ?, 'AVAILABLE', ?, ?, 0, false)
                    """, id, sourceId, beneficiaryId, amountCents, direction, now, now);
        } catch (DuplicateKeyException duplicate) {
            return findCommission(sourceId, beneficiaryId);
        }
        outboxService.append("commission", id, "commission.available", "{\"beneficiaryId\":\"" + beneficiaryId + "\",\"amountCents\":" + amountCents + "}");
        return findCommissionById(id);
    }

    public WithdrawalView requestWithdrawal(String requesterId, long amountCents, String method, String idempotencyKey) {
        if (idempotencyKey == null || idempotencyKey.isBlank() || idempotencyKey.length() > 128) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Idempotency-Key 不能为空且不能超过 128 字符");
        }
        String id = Ids.uuid("WITHDRAWAL");
        Instant now = Instant.now();
        try {
            jdbc.update("""
                    insert into settlement_withdrawal(id, tenant_id, requester_id, amount_cents, method, status, idempotency_key, created_at, updated_at, version, deleted)
                    values (?, 'PLATFORM', ?, ?, ?, 'PENDING', ?, ?, ?, 0, false)
                    """, id, requesterId, amountCents, method, idempotencyKey, now, now);
        } catch (DuplicateKeyException duplicate) {
            WithdrawalView existing = findWithdrawalByKey(requesterId, idempotencyKey);
            if (existing == null) throw duplicate;
            if (existing.amountCents() != amountCents || !existing.method().equals(method)) {
                throw new BusinessException(ErrorCode.IDEMPOTENCY_CONFLICT);
            }
            return existing;
        }
        return findWithdrawal(id);
    }

    private WithdrawalView findWithdrawalByKey(String requesterId, String idempotencyKey) {
        List<WithdrawalView> rows = jdbc.query("""
                select * from settlement_withdrawal
                 where tenant_id='PLATFORM' and requester_id=? and idempotency_key=? and deleted=false
                """, (rs, rowNum) -> mapWithdrawal(rs), requesterId, idempotencyKey);
        return rows.isEmpty() ? null : rows.get(0);
    }

    @Transactional
    public WithdrawalView reviewWithdrawal(String id, boolean approved, String operator, String note) {
        WithdrawalView current = findWithdrawal(id);
        if (current == null) throw new BusinessException(ErrorCode.NOT_FOUND, "提现申请不存在");
        if (!"PENDING".equals(current.status())) throw new BusinessException(ErrorCode.CONFLICT, "该提现申请已处理");
        Instant now = Instant.now();
        int updated = jdbc.update("""
                update settlement_withdrawal set status=?, reviewed_by=?, reviewed_at=?, review_note=?, updated_at=?, version=version+1
                 where id=? and tenant_id='PLATFORM' and status='PENDING'
                """, approved ? "APPROVED" : "REJECTED", operator, now, note, now, id);
        if (updated != 1) throw new BusinessException(ErrorCode.CONFLICT, "该提现申请已被其他操作员处理");
        outboxService.append("withdrawal", id, approved ? "withdrawal.approved" : "withdrawal.rejected", "{\"operator\":\"" + operator + "\"}");
        return findWithdrawal(id);
    }

    public CommissionView findCommission(String sourceId, String beneficiaryId) {
        List<CommissionView> rows = jdbc.query("select * from settlement_commission where tenant_id='PLATFORM' and source_id=? and beneficiary_id=? and deleted=false", (rs, rowNum) -> mapCommission(rs), sourceId, beneficiaryId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    public CommissionView findCommissionById(String id) {
        List<CommissionView> rows = jdbc.query("select * from settlement_commission where tenant_id='PLATFORM' and id=? and deleted=false", (rs, rowNum) -> mapCommission(rs), id);
        return rows.isEmpty() ? null : rows.get(0);
    }

    public WithdrawalView findWithdrawal(String id) {
        List<WithdrawalView> rows = jdbc.query("select * from settlement_withdrawal where tenant_id='PLATFORM' and id=? and deleted=false", (rs, rowNum) -> mapWithdrawal(rs), id);
        return rows.isEmpty() ? null : rows.get(0);
    }

    private CommissionView mapCommission(ResultSet rs) throws SQLException {
        return new CommissionView(rs.getString("id"), rs.getString("source_id"), rs.getString("beneficiary_id"), rs.getLong("amount_cents"), rs.getString("direction"), rs.getString("status"), rs.getTimestamp("created_at").toInstant());
    }

    private WithdrawalView mapWithdrawal(ResultSet rs) throws SQLException {
        return new WithdrawalView(rs.getString("id"), rs.getString("requester_id"), rs.getLong("amount_cents"), rs.getString("method"), rs.getString("status"), rs.getString("reviewed_by"), rs.getTimestamp("created_at").toInstant(), rs.getTimestamp("reviewed_at") == null ? null : rs.getTimestamp("reviewed_at").toInstant());
    }
}

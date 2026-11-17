package com.agritainmen.settlement.service;

import com.agritainmen.common.core.BusinessException;
import com.agritainmen.common.core.ErrorCode;
import com.agritainmen.common.core.Ids;
import com.agritainmen.common.event.OutboxService;
import com.agritainmen.settlement.web.SettlementDtos.CommissionView;
import com.agritainmen.settlement.web.SettlementDtos.CommissionPage;
import com.agritainmen.settlement.web.SettlementDtos.WithdrawalView;
import com.agritainmen.settlement.web.SettlementDtos.WithdrawalPage;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

@Service
public class SettlementService {
    private final JdbcTemplate jdbc;
    private final OutboxService outboxService;
    private final TransactionTemplate transactions;

    public SettlementService(JdbcTemplate jdbc, OutboxService outboxService, PlatformTransactionManager transactionManager) {
        this.jdbc = jdbc;
        this.outboxService = outboxService;
        this.transactions = new TransactionTemplate(transactionManager);
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
        WithdrawalView replayed = findWithdrawalByKey(requesterId, idempotencyKey);
        if (replayed != null) return verifyReplay(replayed, amountCents, method);
        String id = Ids.uuid("WITHDRAWAL");
        Instant now = Instant.now();
        try {
            return transactions.execute(status -> {
                jdbc.query("select id from settlement_commission where tenant_id='PLATFORM' and beneficiary_id=? and status='AVAILABLE' and deleted=false for update", (rs, rowNum) -> rs.getString(1), requesterId);
                WithdrawalView existing = findWithdrawalByKey(requesterId, idempotencyKey);
                if (existing != null) return verifyReplay(existing, amountCents, method);
                long available = availableForWithdrawal(requesterId);
                if (amountCents <= 0 || amountCents > available) {
                    throw new BusinessException(ErrorCode.CONFLICT, "可提现佣金不足，请刷新后重试");
                }
                jdbc.update("""
                        insert into settlement_withdrawal(id, tenant_id, requester_id, amount_cents, method, status, idempotency_key, created_at, updated_at, version, deleted)
                        values (?, 'PLATFORM', ?, ?, ?, 'PENDING', ?, ?, ?, 0, false)
                        """, id, requesterId, amountCents, method, idempotencyKey, now, now);
                return findWithdrawal(id);
            });
        } catch (DuplicateKeyException duplicate) {
            WithdrawalView existing = findWithdrawalByKey(requesterId, idempotencyKey);
            if (existing == null) throw duplicate;
            return verifyReplay(existing, amountCents, method);
        }
    }

    private WithdrawalView verifyReplay(WithdrawalView existing, long amountCents, String method) {
        if (existing.amountCents() != amountCents || !existing.method().equals(method)) {
            throw new BusinessException(ErrorCode.IDEMPOTENCY_CONFLICT);
        }
        return existing;
    }

    public long availableForWithdrawal(String requesterId) {
        long earned = jdbc.queryForObject("select coalesce(sum(amount_cents),0) from settlement_commission where tenant_id='PLATFORM' and beneficiary_id=? and status='AVAILABLE' and deleted=false", Long.class, requesterId);
        long reserved = jdbc.queryForObject("select coalesce(sum(amount_cents),0) from settlement_withdrawal where tenant_id='PLATFORM' and requester_id=? and status in ('PENDING','APPROVED') and deleted=false", Long.class, requesterId);
        return Math.max(0, earned - reserved);
    }

    public long approvedWithdrawalCents(String requesterId) {
        return jdbc.queryForObject("select coalesce(sum(amount_cents),0) from settlement_withdrawal where tenant_id='PLATFORM' and requester_id=? and status='APPROVED' and deleted=false", Long.class, requesterId);
    }

    public CommissionPage listCommissions(String beneficiaryId, int page, int pageSize, String beforeId) {
        List<CommissionView> items;
        if (beforeId == null) {
            items = jdbc.query("select * from settlement_commission where tenant_id='PLATFORM' and beneficiary_id=? and deleted=false order by created_at desc, id desc limit ? offset ?",
                    (rs, rowNum) -> mapCommission(rs), beneficiaryId, pageSize, ((long) page - 1) * pageSize);
        } else {
            List<java.sql.Timestamp> cursors = jdbc.query("select created_at from settlement_commission where tenant_id='PLATFORM' and beneficiary_id=? and id=? and deleted=false",
                    (rs, rowNum) -> rs.getTimestamp(1), beneficiaryId, beforeId);
            if (cursors.isEmpty()) throw new BusinessException(ErrorCode.BAD_REQUEST, "beforeId 不属于当前团长或不存在");
            java.sql.Timestamp createdAt = cursors.get(0);
            items = jdbc.query("select * from settlement_commission where tenant_id='PLATFORM' and beneficiary_id=? and deleted=false and (created_at < ? or (created_at = ? and id < ?)) order by created_at desc, id desc limit ?",
                    (rs, rowNum) -> mapCommission(rs), beneficiaryId, createdAt, createdAt, beforeId, pageSize);
        }
        Long total = jdbc.queryForObject("select count(*) from settlement_commission where tenant_id='PLATFORM' and beneficiary_id=? and deleted=false", Long.class, beneficiaryId);
        return new CommissionPage(items, page, pageSize, total == null ? 0 : total);
    }

    public WithdrawalPage listWithdrawals(String requesterId, int page, int pageSize, String beforeId) {
        List<WithdrawalView> items;
        if (beforeId == null) {
            items = jdbc.query("select * from settlement_withdrawal where tenant_id='PLATFORM' and requester_id=? and deleted=false order by created_at desc, id desc limit ? offset ?",
                    (rs, rowNum) -> mapWithdrawal(rs), requesterId, pageSize, ((long) page - 1) * pageSize);
        } else {
            List<java.sql.Timestamp> cursors = jdbc.query("select created_at from settlement_withdrawal where tenant_id='PLATFORM' and requester_id=? and id=? and deleted=false",
                    (rs, rowNum) -> rs.getTimestamp(1), requesterId, beforeId);
            if (cursors.isEmpty()) throw new BusinessException(ErrorCode.BAD_REQUEST, "beforeId 不属于当前申请人或不存在");
            java.sql.Timestamp createdAt = cursors.get(0);
            items = jdbc.query("select * from settlement_withdrawal where tenant_id='PLATFORM' and requester_id=? and deleted=false and (created_at < ? or (created_at = ? and id < ?)) order by created_at desc, id desc limit ?",
                    (rs, rowNum) -> mapWithdrawal(rs), requesterId, createdAt, createdAt, beforeId, pageSize);
        }
        Long total = jdbc.queryForObject("select count(*) from settlement_withdrawal where tenant_id='PLATFORM' and requester_id=? and deleted=false", Long.class, requesterId);
        Long pendingTotal = jdbc.queryForObject("select count(*) from settlement_withdrawal where tenant_id='PLATFORM' and requester_id=? and status='PENDING' and deleted=false", Long.class, requesterId);
        return new WithdrawalPage(items, page, pageSize, total == null ? 0 : total, pendingTotal == null ? 0 : pendingTotal);
    }

    public WithdrawalPage listWithdrawalsForAdmin(String requesterId, int page, int pageSize, String status, String keyword) {
        StringBuilder where = new StringBuilder(" where tenant_id='PLATFORM' and deleted=false");
        List<Object> args = new ArrayList<>();
        if (!requesterId.isBlank()) {
            where.append(" and requester_id=?");
            args.add(requesterId);
        }
        if (!status.isBlank()) {
            where.append(" and status=?");
            args.add(status);
        }
        if (!keyword.isBlank()) {
            where.append(" and (locate(?, lower(id))>0 or locate(?, lower(requester_id))>0 or locate(?, lower(method))>0)");
            String search = keyword.toLowerCase(Locale.ROOT);
            args.add(search);
            args.add(search);
            args.add(search);
        }
        Long total = jdbc.queryForObject("select count(*) from settlement_withdrawal" + where, Long.class, args.toArray());
        Long pendingTotal = jdbc.queryForObject("select count(*) from settlement_withdrawal where tenant_id='PLATFORM' and deleted=false and status='PENDING'", Long.class);
        List<Object> pageArgs = new ArrayList<>(args);
        pageArgs.add(pageSize);
        pageArgs.add(((long) page - 1) * pageSize);
        List<WithdrawalView> items = jdbc.query("select * from settlement_withdrawal" + where + " order by created_at desc, id desc limit ? offset ?",
                (rs, rowNum) -> mapWithdrawal(rs), pageArgs.toArray());
        return new WithdrawalPage(items, page, pageSize, total == null ? 0 : total, pendingTotal == null ? 0 : pendingTotal);
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
        return new WithdrawalView(rs.getString("id"), rs.getString("requester_id"), rs.getLong("amount_cents"), rs.getString("method"), rs.getString("status"), rs.getString("reviewed_by"), rs.getString("review_note"), rs.getTimestamp("created_at").toInstant(), rs.getTimestamp("reviewed_at") == null ? null : rs.getTimestamp("reviewed_at").toInstant());
    }
}

package com.agritainmen.payment.service;

import com.agritainmen.common.core.BusinessException;
import com.agritainmen.common.core.ErrorCode;
import com.agritainmen.common.core.Ids;
import com.agritainmen.common.event.OutboxService;
import com.agritainmen.payment.provider.PaymentProvider;
import com.agritainmen.payment.web.PaymentDtos.CallbackRequest;
import com.agritainmen.payment.web.PaymentDtos.PaymentView;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;

@Service
public class PaymentService {
    private final JdbcTemplate jdbc;
    private final OutboxService outboxService;
    private final PaymentProvider paymentProvider;

    public PaymentService(JdbcTemplate jdbc, OutboxService outboxService, PaymentProvider paymentProvider) {
        this.jdbc = jdbc;
        this.outboxService = outboxService;
        this.paymentProvider = paymentProvider;
    }

    @Transactional
    public PaymentView create(String orderId, long amountCents, String channel) {
        PaymentView existing = findByOrder(orderId);
        if (existing != null) return existing;
        if (amountCents <= 0) throw new BusinessException(ErrorCode.BAD_REQUEST, "支付金额必须大于 0");
        PaymentProvider.ProviderIntent providerIntent = paymentProvider.createIntent(orderId, amountCents, channel);
        String id = Ids.uuid("PAY");
        Instant now = Instant.now();
        jdbc.update("""
                insert into payment_intent(id, tenant_id, order_id, amount_cents, channel, status, created_at, updated_at, version, deleted)
                values (?, 'PLATFORM', ?, ?, ?, 'CREATED', ?, ?, 0, false)
                """, id, orderId, amountCents, channel, now, now);
        return find(id);
    }

    @Transactional
    public PaymentView callback(CallbackRequest request) {
        PaymentView current = findByOrder(request.orderId());
        if (current == null) throw new BusinessException(ErrorCode.NOT_FOUND, "支付单不存在");
        if (!paymentProvider.verifyCallback(request.providerTxnId(), current.amountCents())) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "支付回调校验失败");
        }
        String eventId = Ids.uuid("PAYEVENT");
        try {
            jdbc.update("""
                    insert into payment_callback_event(id, tenant_id, provider, provider_txn_id, order_id, success, failure_reason, created_at)
                    values (?, 'PLATFORM', ?, ?, ?, ?, ?, ?)
                    """, eventId, request.provider(), request.providerTxnId(), request.orderId(), request.success(), request.failureReason(), Instant.now());
        } catch (DuplicateKeyException duplicate) {
            return findByOrder(request.orderId());
        }
        String nextStatus = request.success() ? "PAID" : "FAILED";
        int updated = jdbc.update("""
                update payment_intent set status=?, provider_txn_id=?, paid_at=?, updated_at=?, version=version+1
                 where order_id=? and tenant_id='PLATFORM' and status='CREATED'
                """, nextStatus, request.success() ? request.providerTxnId() : null, request.success() ? Instant.now() : null, Instant.now(), request.orderId());
        if (updated == 0) return findByOrder(request.orderId());
        outboxService.append("payment", current.id(), request.success() ? "payment.succeeded" : "payment.failed",
                "{\"orderId\":\"" + request.orderId() + "\",\"providerTxnId\":\"" + request.providerTxnId() + "\"}");
        return findByOrder(request.orderId());
    }

    public PaymentView findByOrder(String orderId) {
        List<PaymentView> rows = jdbc.query("select * from payment_intent where order_id=? and tenant_id='PLATFORM' and deleted=false", (rs, rowNum) -> map(rs), orderId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    public PaymentView find(String id) {
        List<PaymentView> rows = jdbc.query("select * from payment_intent where id=? and tenant_id='PLATFORM' and deleted=false", (rs, rowNum) -> map(rs), id);
        return rows.isEmpty() ? null : rows.get(0);
    }

    private PaymentView map(ResultSet rs) throws SQLException {
        return new PaymentView(rs.getString("id"), rs.getString("order_id"), rs.getLong("amount_cents"), rs.getString("channel"),
                rs.getString("status"), rs.getString("provider_txn_id"), rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("paid_at") == null ? null : rs.getTimestamp("paid_at").toInstant());
    }
}

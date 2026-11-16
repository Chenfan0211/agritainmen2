package com.agritainmen.payment.service;

import com.agritainmen.common.core.BusinessException;
import com.agritainmen.common.core.ErrorCode;
import com.agritainmen.common.core.Ids;
import com.agritainmen.common.event.OutboxService;
import com.agritainmen.payment.client.OrderPaymentClient;
import com.agritainmen.payment.provider.PaymentProvider;
import com.agritainmen.payment.web.PaymentDtos.CallbackRequest;
import com.agritainmen.payment.web.PaymentDtos.PaymentView;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;

@Service
public class PaymentService {
    private static final Logger log = LoggerFactory.getLogger(PaymentService.class);
    private final JdbcTemplate jdbc;
    private final OutboxService outboxService;
    private final PaymentProvider paymentProvider;
    private final OrderPaymentClient orderClient;
    private final TransactionTemplate transactions;

    public PaymentService(JdbcTemplate jdbc, OutboxService outboxService, PaymentProvider paymentProvider,
            OrderPaymentClient orderClient, TransactionTemplate transactions) {
        this.jdbc = jdbc;
        this.outboxService = outboxService;
        this.paymentProvider = paymentProvider;
        this.orderClient = orderClient;
        this.transactions = transactions;
    }

    @Transactional
    public PaymentView create(String orderId, long amountCents, String channel, String authorization) {
        OrderPaymentClient.OrderSnapshot order = orderClient.load(orderId, authorization);
        if (amountCents <= 0) throw new BusinessException(ErrorCode.BAD_REQUEST, "支付金额必须大于 0");
        if (order.amountCents() != amountCents) throw new BusinessException(ErrorCode.CONFLICT, "支付金额与订单不符");
        if (!"PENDING_PAYMENT".equals(order.status()) && !"PAID".equals(order.status()))
            throw new BusinessException(ErrorCode.CONFLICT, "当前订单状态不可支付");
        PaymentView existing = findByOrder(orderId);
        if (existing != null) {
            if (existing.amountCents() != amountCents || !existing.channel().equals(channel))
                throw new BusinessException(ErrorCode.CONFLICT, "支付意图与订单不符");
            return existing;
        }
        if (!"PENDING_PAYMENT".equals(order.status()))
            throw new BusinessException(ErrorCode.CONFLICT, "当前订单状态不可创建支付单");
        paymentProvider.createIntent(orderId, amountCents, channel);
        String id = Ids.uuid("PAY");
        Instant now = Instant.now();
        jdbc.update("""
                insert into payment_intent(id, tenant_id, order_id, amount_cents, channel, status, created_at, updated_at, version, deleted)
                values (?, 'PLATFORM', ?, ?, ?, 'CREATED', ?, ?, 0, false)
                """, id, orderId, amountCents, channel, now, now);
        return find(id);
    }

    public PaymentView callback(CallbackRequest request) {
        PaymentView recorded = transactions.execute(status -> recordCallback(request));
        if (recorded == null) throw new IllegalStateException("支付回调未记录");
        return "PAID_PENDING_ORDER".equals(recorded.status()) ? reconcile(recorded.orderId()) : recorded;
    }

    private PaymentView recordCallback(CallbackRequest request) {
        List<PaymentView> rows = jdbc.query("select * from payment_intent where order_id=? and tenant_id='PLATFORM' and deleted=false for update",
                (rs, rowNum) -> map(rs), request.orderId());
        if (rows.isEmpty()) throw new BusinessException(ErrorCode.NOT_FOUND, "支付单不存在");
        PaymentView current = rows.get(0);
        if (!current.channel().equals(request.provider())
                || !paymentProvider.verifyCallback(request.providerTxnId(), current.amountCents()))
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "支付回调校验失败");
        if (!"CREATED".equals(current.status())) {
            boolean sameOutcome = request.success() ? !"FAILED".equals(current.status()) : "FAILED".equals(current.status());
            if (!request.providerTxnId().equals(current.providerTxnId()) || !sameOutcome)
                throw new BusinessException(ErrorCode.CONFLICT, "支付回调与已记录结果不一致");
            return current;
        }
        try {
            jdbc.update("""
                    insert into payment_callback_event(id, tenant_id, provider, provider_txn_id, order_id, success, failure_reason, created_at)
                    values (?, 'PLATFORM', ?, ?, ?, ?, ?, ?)
                    """, Ids.uuid("PAYEVENT"), request.provider(), request.providerTxnId(), request.orderId(),
                    request.success(), request.failureReason(), Instant.now());
        } catch (org.springframework.dao.DuplicateKeyException duplicate) {
            throw new BusinessException(ErrorCode.CONFLICT, "支付流水号已被使用");
        }
        jdbc.update("""
                update payment_intent set status=?, provider_txn_id=?, paid_at=?, updated_at=?, version=version+1
                 where id=? and tenant_id='PLATFORM' and status='CREATED'
                """, request.success() ? "PAID_PENDING_ORDER" : "FAILED", request.providerTxnId(),
                request.success() ? Instant.now() : null, Instant.now(), current.id());
        outboxService.append("payment", current.id(), request.success() ? "payment.provider_succeeded" : "payment.failed",
                "{\"orderId\":\"" + current.orderId() + "\"}");
        return find(current.id());
    }

    public PaymentView reconcile(String orderId) {
        PaymentView current = findByOrder(orderId);
        if (current == null || !"PAID_PENDING_ORDER".equals(current.status())) return current;
        String orderStatus;
        try {
            orderStatus = orderClient.confirm(orderId, current.amountCents());
        } catch (Exception exception) {
            log.warn("支付订单同步待重试: orderId={}, reason={}", orderId, exception.toString());
            jdbc.update("update payment_intent set updated_at=? where id=? and status='PAID_PENDING_ORDER'",
                    Instant.now(), current.id());
            return current;
        }
        String next = switch (orderStatus) {
            case "PAID" -> "PAID";
            case "UNPAID_CANCELLED" -> "REFUND_REQUIRED";
            default -> null;
        };
        if (next == null) return current;
        return transactions.execute(status -> {
            int updated = jdbc.update("""
                    update payment_intent set status=?, updated_at=?, version=version+1
                     where id=? and tenant_id='PLATFORM' and status='PAID_PENDING_ORDER'
                    """, next, Instant.now(), current.id());
            if (updated == 1) outboxService.append("payment", current.id(),
                    "PAID".equals(next) ? "payment.succeeded" : "payment.refund_required",
                    "{\"orderId\":\"" + orderId + "\"}");
            return find(current.id());
        });
    }

    @Scheduled(fixedDelayString = "${agritainmen.payment.reconcile-delay-ms:30000}")
    public void reconcilePending() {
        List<String> orderIds = jdbc.query("""
                select order_id from payment_intent
                 where tenant_id='PLATFORM' and deleted=false and status='PAID_PENDING_ORDER'
                 order by updated_at, id limit 50
                """, (rs, rowNum) -> rs.getString(1));
        for (String orderId : orderIds) reconcile(orderId);
    }

    public PaymentView findForBuyer(String orderId, String authorization) {
        orderClient.load(orderId, authorization);
        return findByOrder(orderId);
    }

    public PaymentView findByOrder(String orderId) {
        List<PaymentView> rows = jdbc.query("select * from payment_intent where order_id=? and tenant_id='PLATFORM' and deleted=false",
                (rs, rowNum) -> map(rs), orderId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    public PaymentView find(String id) {
        List<PaymentView> rows = jdbc.query("select * from payment_intent where id=? and tenant_id='PLATFORM' and deleted=false",
                (rs, rowNum) -> map(rs), id);
        return rows.isEmpty() ? null : rows.get(0);
    }

    private PaymentView map(ResultSet rs) throws SQLException {
        return new PaymentView(rs.getString("id"), rs.getString("order_id"), rs.getLong("amount_cents"), rs.getString("channel"),
                rs.getString("status"), rs.getString("provider_txn_id"), rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("paid_at") == null ? null : rs.getTimestamp("paid_at").toInstant());
    }
}

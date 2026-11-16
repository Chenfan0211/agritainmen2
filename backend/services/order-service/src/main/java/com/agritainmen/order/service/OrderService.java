package com.agritainmen.order.service;

import com.agritainmen.common.core.BusinessException;
import com.agritainmen.common.core.ErrorCode;
import com.agritainmen.common.core.Ids;
import com.agritainmen.common.event.OutboxService;
import com.agritainmen.order.client.CatalogClient;
import com.agritainmen.order.client.InventoryClient;
import com.agritainmen.order.web.OrderDtos.CreateOrderRequest;
import com.agritainmen.order.web.OrderDtos.OrderLineRequest;
import com.agritainmen.order.web.OrderDtos.OrderLineView;
import com.agritainmen.order.web.OrderDtos.OrderView;
import com.agritainmen.order.web.OrderDtos.PriceQuote;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Service
public class OrderService {
    private static final Logger log = LoggerFactory.getLogger(OrderService.class);
    private final JdbcTemplate jdbc;
    private final CatalogClient catalogClient;
    private final InventoryClient inventoryClient;
    private final OutboxService outboxService;
    private final TransactionTemplate transactions;

    public OrderService(JdbcTemplate jdbc, CatalogClient catalogClient, InventoryClient inventoryClient,
                        OutboxService outboxService, TransactionTemplate transactions) {
        this.jdbc = jdbc;
        this.catalogClient = catalogClient;
        this.inventoryClient = inventoryClient;
        this.outboxService = outboxService;
        this.transactions = transactions;
    }

    public OrderView create(String idempotencyKey, CreateOrderRequest request) {
        if (idempotencyKey == null || idempotencyKey.isBlank()) throw new BusinessException(ErrorCode.BAD_REQUEST, "Idempotency-Key 不能为空");
        OrderView existing = findByIdempotencyKey(idempotencyKey);
        if (existing != null) {
            return resumeCreation(idempotencyKey, request, existing);
        }

        List<QuotedLine> quoted = new ArrayList<>();
        long amount = 0;
        for (OrderLineRequest line : request.items()) {
            PriceQuote quote = catalogClient.quote(line.skuId());
            long lineAmount = quote.unitPriceCents() * line.quantity();
            amount += lineAmount;
            quoted.add(new QuotedLine(quote, line.quantity(), lineAmount));
        }
        String orderId = Ids.uuid("ORDER");
        String orderNo = Ids.business("C-MALL") + orderId.substring("ORDER-".length());
        long orderAmount = amount;
        try {
            transactions.execute(status -> stageCreation(idempotencyKey, request, quoted, orderId, orderNo, orderAmount));
        } catch (DuplicateKeyException duplicate) {
            OrderView raced = findByIdempotencyKey(idempotencyKey);
            if (raced != null) return resumeCreation(idempotencyKey, request, raced);
            throw new BusinessException(ErrorCode.CONFLICT, "该请求正在处理，请稍后重试");
        }
        return completeCreatingOrder(orderId);
    }

    private OrderView resumeCreation(String idempotencyKey, CreateOrderRequest request, OrderView existing) {
        String storedHash = requestHash(idempotencyKey);
        if (storedHash == null || !request.toString().equals(storedHash))
            throw new BusinessException(ErrorCode.IDEMPOTENCY_CONFLICT);
        if ("CREATE_FAILED".equals(existing.status())) throw new BusinessException(ErrorCode.OUT_OF_STOCK);
        return "CREATING".equals(existing.status()) ? completeCreatingOrder(existing.id()) : existing;
    }

    private String stageCreation(String idempotencyKey, CreateOrderRequest request, List<QuotedLine> quoted,
                                 String orderId, String orderNo, long amount) {
        Instant now = Instant.now();
        jdbc.update("""
                insert into trade_order_request(id, tenant_id, scene, idempotency_key, request_hash, order_id, created_at, updated_at, version, deleted)
                values (?, 'PLATFORM', 'order.create', ?, ?, ?, ?, ?, 0, false)
                """, Ids.uuid("OREQ"), idempotencyKey, request.toString(), orderId, now, now);
        jdbc.update("""
                insert into trade_order(id, tenant_id, order_no, buyer_id, status, amount_cents, reservation_id, receiver, receiver_phone, address, created_at, updated_at, version, deleted)
                values (?, 'PLATFORM', ?, ?, 'CREATING', ?, null, ?, ?, ?, ?, ?, 0, false)
                """, orderId, orderNo, request.buyerId(), amount, request.receiver(), request.receiverPhone(), request.address(), now, now);
        for (QuotedLine line : quoted) {
            jdbc.update("""
                    insert into trade_order_item(id, tenant_id, order_id, sku_id, product_id, supplier_id, product_name, unit_price_cents, quantity, amount_cents, created_at, updated_at, version, deleted)
                    values (?, 'PLATFORM', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, false)
                    """, Ids.uuid("OITEM"), orderId, line.quote.skuId(), line.quote.productId(), line.quote.supplierId(), line.quote.name(), line.quote.unitPriceCents(), line.quantity, line.amount, now, now);
        }
        return orderId;
    }

    private OrderView completeCreatingOrder(String orderId) {
        CreationResult result = transactions.execute(status -> completeCreatingOrderLocked(orderId));
        if (result == null) throw new IllegalStateException("订单创建事务未返回结果");
        if (result.failure != null) throw result.failure;
        return result.order;
    }

    private CreationResult completeCreatingOrderLocked(String orderId) {
        List<OrderRow> rows = jdbc.query("select * from trade_order where id=? and tenant_id='PLATFORM' and deleted=false for update",
                (rs, rowNum) -> mapOrder(rs), orderId);
        if (rows.isEmpty()) throw new BusinessException(ErrorCode.NOT_FOUND, "订单不存在");
        OrderRow order = rows.get(0);
        if ("CREATE_FAILED".equals(order.status))
            return new CreationResult(null, new BusinessException(ErrorCode.OUT_OF_STOCK));
        if (!"CREATING".equals(order.status)) return new CreationResult(toView(order), null);
        List<InventoryClient.Line> lines = jdbc.query("""
                select sku_id, quantity from trade_order_item
                 where order_id=? and tenant_id='PLATFORM' and deleted=false
                 order by sku_id, id
                """, (rs, rowNum) -> new InventoryClient.Line(rs.getString(1), rs.getInt(2)), orderId);
        InventoryClient.Reservation reservation;
        try {
            reservation = inventoryClient.reserve(orderId, lines, order.createdAt.plusSeconds(1800));
        } catch (BusinessException exception) {
            if (exception.errorCode() == ErrorCode.OUT_OF_STOCK) {
                jdbc.update("""
                        update trade_order set status='CREATE_FAILED', updated_at=?, version=version+1
                         where id=? and tenant_id='PLATFORM' and status='CREATING' and deleted=false
                        """, Instant.now(), orderId);
                return new CreationResult(null, exception);
            }
            throw exception;
        }
        if (reservation == null || reservation.id() == null || reservation.id().isBlank()
                || !orderId.equals(reservation.orderId()) || !"RESERVED".equals(reservation.status()))
            throw new BusinessException(ErrorCode.CONFLICT, "库存预占未完成，请重试");
        return new CreationResult(finalizeCreation(orderId, reservation.id()), null);
    }

    private OrderView finalizeCreation(String orderId, String reservationId) {
        List<OrderRow> rows = jdbc.query("select * from trade_order where id=? and tenant_id='PLATFORM' and deleted=false for update",
                (rs, rowNum) -> mapOrder(rs), orderId);
        if (rows.isEmpty()) throw new BusinessException(ErrorCode.NOT_FOUND, "订单不存在");
        OrderRow order = rows.get(0);
        if ("PENDING_PAYMENT".equals(order.status)) return toView(order);
        if (!"CREATING".equals(order.status)) throw new BusinessException(ErrorCode.CONFLICT, "订单创建状态已变化");
        int updated = jdbc.update("""
                update trade_order set status='PENDING_PAYMENT', reservation_id=?, updated_at=?, version=version+1
                 where id=? and tenant_id='PLATFORM' and status='CREATING' and deleted=false
                """, reservationId, Instant.now(), orderId);
        if (updated != 1) throw new BusinessException(ErrorCode.CONFLICT);
        outboxService.append("order", orderId, "order.created",
                "{\"orderId\":\"" + orderId + "\",\"amountCents\":" + order.amountCents + "}");
        return find(orderId);
    }

    @Scheduled(fixedDelayString = "${agritainmen.order.create-retry-ms:30000}")
    public void retryPendingCreations() {
        List<String> orderIds = jdbc.query("""
                select id from trade_order
                 where tenant_id='PLATFORM' and status='CREATING' and deleted=false
                 order by updated_at, id limit 50
                """, (rs, rowNum) -> rs.getString(1));
        for (String orderId : orderIds) {
            try {
                completeCreatingOrder(orderId);
            } catch (Exception exception) {
                if (exception instanceof BusinessException business && business.errorCode() == ErrorCode.OUT_OF_STOCK) {
                    log.info("订单创建库存不足，停止重试: orderId={}", orderId);
                    continue;
                }
                log.warn("订单创建库存预占待重试: orderId={}, reason={}", orderId, exception.toString());
                jdbc.update("""
                        update trade_order set updated_at=?
                         where id=? and tenant_id='PLATFORM' and status='CREATING' and deleted=false
                        """, Instant.now(), orderId);
            }
        }
    }

    public com.agritainmen.order.web.OrderController.OrderPage list(String buyerId, int page, int pageSize) {
        String normalized = buyerId == null ? "" : buyerId.trim();
        String where = normalized.isBlank() ? " where tenant_id='PLATFORM' and deleted=false and status not in ('CREATING', 'CREATE_FAILED')"
                : " where tenant_id='PLATFORM' and deleted=false and status not in ('CREATING', 'CREATE_FAILED') and buyer_id=?";
        Object[] args = normalized.isBlank() ? new Object[0] : new Object[]{normalized};
        Long total = jdbc.queryForObject("select count(*) from trade_order" + where, Long.class, args);
        Object[] pageArgs = new Object[args.length + 2];
        System.arraycopy(args, 0, pageArgs, 0, args.length);
        pageArgs[args.length] = pageSize;
        pageArgs[args.length + 1] = (page - 1) * pageSize;
        List<OrderView> items = jdbc.query("select id, order_no, buyer_id, status, amount_cents, reservation_id, receiver, receiver_phone, address, created_at, confirmation_pending from trade_order" + where + " order by created_at, id limit ? offset ?",
                (rs, rowNum) -> toView(mapOrder(rs)), pageArgs);
        return new com.agritainmen.order.web.OrderController.OrderPage(items, page, pageSize, total == null ? 0 : total);
    }

    public OrderView find(String orderId) {
        List<OrderRow> rows = jdbc.query("select * from trade_order where id=? and tenant_id='PLATFORM' and deleted=false", (rs, rowNum) -> mapOrder(rs), orderId);
        if (rows.isEmpty()) throw new BusinessException(ErrorCode.NOT_FOUND, "订单不存在");
        return toView(rows.get(0));
    }

    public OrderView cancelPending(String orderId) {
        OrderView cancelled = transactions.execute(status -> markUnpaidCancelled(orderId));
        if (cancelled == null) throw new IllegalStateException("取消订单事务未返回结果");
        releaseCancelledReservation(orderId);
        return find(orderId);
    }

    private OrderView markUnpaidCancelled(String orderId) {
        List<OrderRow> rows = jdbc.query("select * from trade_order where id=? and tenant_id='PLATFORM' and deleted=false for update",
                (rs, rowNum) -> mapOrder(rs), orderId);
        if (rows.isEmpty()) throw new BusinessException(ErrorCode.NOT_FOUND, "订单不存在");
        OrderRow order = rows.get(0);
        if ("UNPAID_CANCELLED".equals(order.status)) return toView(order);
        if (!"PENDING_PAYMENT".equals(order.status)) throw new BusinessException(ErrorCode.CONFLICT, "当前订单状态不可取消");
        if (order.confirmationPending) throw new BusinessException(ErrorCode.CONFLICT, "订单正在确认支付，不可取消");
        int updated = jdbc.update("""
                update trade_order set status='UNPAID_CANCELLED', release_pending=true, updated_at=?, version=version+1
                 where id=? and tenant_id='PLATFORM' and status='PENDING_PAYMENT'
                   and confirmation_pending=false and deleted=false
                """, Instant.now(), orderId);
        if (updated != 1) throw new BusinessException(ErrorCode.CONFLICT);
        outboxService.append("order", orderId, "order.unpaid_cancelled", "{\"orderId\":\"" + orderId + "\"}");
        return find(orderId);
    }

    private void releaseCancelledReservation(String orderId) {
        List<String> reservations = jdbc.query("""
                select reservation_id from trade_order
                 where id=? and tenant_id='PLATFORM' and status='UNPAID_CANCELLED'
                   and release_pending=true and deleted=false
                """, (rs, rowNum) -> rs.getString(1), orderId);
        if (reservations.isEmpty()) return;
        String reservationId = reservations.get(0);
        try {
            InventoryClient.Reservation released = inventoryClient.release(reservationId);
            if (released == null || !reservationId.equals(released.id()) || !"RELEASED".equals(released.status()))
                throw new BusinessException(ErrorCode.CONFLICT, "库存预占未释放");
            jdbc.update("""
                    update trade_order set release_pending=false, updated_at=?, version=version+1
                     where id=? and tenant_id='PLATFORM' and status='UNPAID_CANCELLED'
                       and release_pending=true and deleted=false
                    """, Instant.now(), orderId);
        } catch (Exception exception) {
            log.warn("取消订单库存释放待重试: orderId={}, reason={}", orderId, exception.toString());
            jdbc.update("""
                    update trade_order set updated_at=?
                     where id=? and tenant_id='PLATFORM' and status='UNPAID_CANCELLED'
                       and release_pending=true and deleted=false
                    """, Instant.now(), orderId);
        }
    }

    @Scheduled(fixedDelayString = "${agritainmen.order.release-retry-ms:30000}")
    public void retryPendingReleases() {
        List<String> orderIds = jdbc.query("""
                select id from trade_order
                 where tenant_id='PLATFORM' and status='UNPAID_CANCELLED'
                   and release_pending=true and deleted=false
                 order by updated_at, id limit 50
                """, (rs, rowNum) -> rs.getString(1));
        for (String orderId : orderIds) releaseCancelledReservation(orderId);
    }

    public OrderView confirmPaid(String orderId, long amountCents) {
        OrderView current = transactions.execute(status -> markPaymentConfirmationPending(orderId, amountCents));
        if (current == null) throw new IllegalStateException("支付确认事务未返回结果");
        if (!"PENDING_PAYMENT".equals(current.status())) return current;
        return confirmPendingInventory(orderId);
    }

    private OrderView markPaymentConfirmationPending(String orderId, long amountCents) {
        List<OrderRow> rows = jdbc.query("select * from trade_order where id=? and tenant_id='PLATFORM' and deleted=false for update",
                (rs, rowNum) -> mapOrder(rs), orderId);
        if (rows.isEmpty()) throw new BusinessException(ErrorCode.NOT_FOUND, "订单不存在");
        OrderRow order = rows.get(0);
        if (order.amountCents != amountCents) throw new BusinessException(ErrorCode.CONFLICT, "支付金额与订单不符");
        if ("PAID".equals(order.status) || "UNPAID_CANCELLED".equals(order.status)) return toView(order);
        if (!"PENDING_PAYMENT".equals(order.status)) throw new BusinessException(ErrorCode.CONFLICT, "当前订单状态不可确认支付");
        if (!order.confirmationPending) {
            int updated = jdbc.update("""
                    update trade_order set confirmation_pending=true, updated_at=?, version=version+1
                     where id=? and tenant_id='PLATFORM' and status='PENDING_PAYMENT'
                       and confirmation_pending=false and deleted=false
                    """, Instant.now(), orderId);
            if (updated != 1) throw new BusinessException(ErrorCode.CONFLICT);
        }
        return find(orderId);
    }

    private OrderView confirmPendingInventory(String orderId) {
        List<String> reservations = jdbc.query("""
                select reservation_id from trade_order
                 where id=? and tenant_id='PLATFORM' and status='PENDING_PAYMENT'
                   and confirmation_pending=true and deleted=false
                """, (rs, rowNum) -> rs.getString(1), orderId);
        if (reservations.isEmpty()) return find(orderId);
        String reservationId = reservations.get(0);
        InventoryClient.Reservation confirmed = inventoryClient.confirm(reservationId);
        if (confirmed == null || !reservationId.equals(confirmed.id()) || !"CONFIRMED".equals(confirmed.status()))
            throw new BusinessException(ErrorCode.CONFLICT, "库存预占未确认，请重试");
        OrderView paid = transactions.execute(status -> finalizePaid(orderId));
        if (paid == null) throw new IllegalStateException("订单支付提交事务未返回结果");
        return paid;
    }

    private OrderView finalizePaid(String orderId) {
        List<OrderRow> rows = jdbc.query("select * from trade_order where id=? and tenant_id='PLATFORM' and deleted=false for update",
                (rs, rowNum) -> mapOrder(rs), orderId);
        if (rows.isEmpty()) throw new BusinessException(ErrorCode.NOT_FOUND, "订单不存在");
        OrderRow order = rows.get(0);
        if ("PAID".equals(order.status)) return toView(order);
        if (!"PENDING_PAYMENT".equals(order.status) || !order.confirmationPending)
            throw new BusinessException(ErrorCode.CONFLICT, "订单支付确认状态已变化");
        int updated = jdbc.update("""
                update trade_order set status='PAID', confirmation_pending=false, updated_at=?, version=version+1
                 where id=? and tenant_id='PLATFORM' and status='PENDING_PAYMENT'
                   and confirmation_pending=true and deleted=false
                """, Instant.now(), orderId);
        if (updated != 1) throw new BusinessException(ErrorCode.CONFLICT);
        outboxService.append("order", orderId, "order.paid", "{\"orderId\":\"" + orderId + "\"}");
        return find(orderId);
    }

    @Scheduled(fixedDelayString = "${agritainmen.order.confirm-retry-ms:30000}")
    public void retryPendingConfirmations() {
        List<String> orderIds = jdbc.query("""
                select id from trade_order
                 where tenant_id='PLATFORM' and status='PENDING_PAYMENT'
                   and confirmation_pending=true and deleted=false
                 order by updated_at, id limit 50
                """, (rs, rowNum) -> rs.getString(1));
        for (String orderId : orderIds) {
            try {
                confirmPendingInventory(orderId);
            } catch (Exception exception) {
                log.warn("订单支付确认待重试: orderId={}, reason={}", orderId, exception.toString());
                jdbc.update("""
                        update trade_order set updated_at=?
                         where id=? and tenant_id='PLATFORM' and status='PENDING_PAYMENT'
                           and confirmation_pending=true and deleted=false
                        """, Instant.now(), orderId);
            }
        }
    }

    public String requestHash(String key) {
        List<String> hashes = jdbc.query("select request_hash from trade_order_request where scene='order.create' and idempotency_key=? and deleted=false", (rs, rowNum) -> rs.getString(1), key);
        return hashes.isEmpty() ? null : hashes.get(0);
    }

    public OrderView findByIdempotencyKey(String key) {
        List<String> ids = jdbc.query("select order_id from trade_order_request where scene='order.create' and idempotency_key=? and deleted=false", (rs, rowNum) -> rs.getString(1), key);
        return ids.isEmpty() ? null : find(ids.get(0));
    }

    private OrderView toView(OrderRow row) {
        List<OrderLineView> items = jdbc.query("""
                select sku_id, product_id, supplier_id, product_name, unit_price_cents, quantity, amount_cents
                  from trade_order_item where order_id=? and deleted=false order by sku_id
                """, (rs, rowNum) -> new OrderLineView(rs.getString("sku_id"), rs.getString("product_id"), rs.getString("supplier_id"),
                rs.getString("product_name"), rs.getLong("unit_price_cents"), rs.getInt("quantity"), rs.getLong("amount_cents")), row.id);
        return new OrderView(row.id, row.orderNo, row.buyerId, row.status, row.amountCents, row.reservationId,
                row.receiver, row.receiverPhone, row.address, items, row.createdAt);
    }

    private OrderRow mapOrder(ResultSet rs) throws SQLException {
        return new OrderRow(rs.getString("id"), rs.getString("order_no"), rs.getString("buyer_id"), rs.getString("status"),
                rs.getLong("amount_cents"), rs.getString("reservation_id"), rs.getString("receiver"), rs.getString("receiver_phone"),
                rs.getString("address"), rs.getTimestamp("created_at").toInstant(), rs.getBoolean("confirmation_pending"));
    }

    private record QuotedLine(PriceQuote quote, int quantity, long amount) {}
    private record CreationResult(OrderView order, BusinessException failure) {}
    private record OrderRow(String id, String orderNo, String buyerId, String status, long amountCents, String reservationId,
                            String receiver, String receiverPhone, String address, Instant createdAt,
                            boolean confirmationPending) {}
}

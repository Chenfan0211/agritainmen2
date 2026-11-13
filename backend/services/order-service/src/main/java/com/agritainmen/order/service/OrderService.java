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
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Service
public class OrderService {
    private final JdbcTemplate jdbc;
    private final CatalogClient catalogClient;
    private final InventoryClient inventoryClient;
    private final OutboxService outboxService;

    public OrderService(JdbcTemplate jdbc, CatalogClient catalogClient, InventoryClient inventoryClient, OutboxService outboxService) {
        this.jdbc = jdbc;
        this.catalogClient = catalogClient;
        this.inventoryClient = inventoryClient;
        this.outboxService = outboxService;
    }

    @Transactional
    public OrderView create(String idempotencyKey, CreateOrderRequest request) {
        if (idempotencyKey == null || idempotencyKey.isBlank()) throw new BusinessException(ErrorCode.BAD_REQUEST, "Idempotency-Key 不能为空");
        OrderView existing = findByIdempotencyKey(idempotencyKey);
        if (existing != null) {
            String storedHash = requestHash(idempotencyKey);
            if (storedHash == null || !request.toString().equals(storedHash)) {
                throw new BusinessException(ErrorCode.IDEMPOTENCY_CONFLICT);
            }
            return existing;
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
        String orderNo = Ids.business("C-MALL");
        InventoryClient.Reservation reservation = inventoryClient.reserve(orderId,
                request.items().stream().map(line -> new InventoryClient.Line(line.skuId(), line.quantity())).toList(),
                Instant.now().plusSeconds(1800));
        Instant now = Instant.now();
        try {
            jdbc.update("""
                    insert into trade_order_request(id, tenant_id, scene, idempotency_key, request_hash, order_id, created_at, updated_at, version, deleted)
                    values (?, 'PLATFORM', 'order.create', ?, ?, ?, ?, ?, 0, false)
                    """, Ids.uuid("OREQ"), idempotencyKey, request.toString(), orderId, now, now);
        } catch (DuplicateKeyException duplicate) {
            OrderView raced = findByIdempotencyKey(idempotencyKey);
            if (raced != null) {
                String storedHash = requestHash(idempotencyKey);
                if (storedHash == null || !request.toString().equals(storedHash)) {
                    throw new BusinessException(ErrorCode.IDEMPOTENCY_CONFLICT);
                }
                return raced;
            }
            throw new BusinessException(ErrorCode.CONFLICT, "该请求正在处理，请稍后重试");
        }
        jdbc.update("""
                insert into trade_order(id, tenant_id, order_no, buyer_id, status, amount_cents, reservation_id, receiver, receiver_phone, address, created_at, updated_at, version, deleted)
                values (?, 'PLATFORM', ?, ?, 'PENDING_PAYMENT', ?, ?, ?, ?, ?, ?, ?, 0, false)
                """, orderId, orderNo, request.buyerId(), amount, reservation.id(), request.receiver(), request.receiverPhone(), request.address(), now, now);
        for (QuotedLine line : quoted) {
            jdbc.update("""
                    insert into trade_order_item(id, tenant_id, order_id, sku_id, product_id, supplier_id, product_name, unit_price_cents, quantity, amount_cents, created_at, updated_at, version, deleted)
                    values (?, 'PLATFORM', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, false)
                    """, Ids.uuid("OITEM"), orderId, line.quote.skuId(), line.quote.productId(), line.quote.supplierId(), line.quote.name(), line.quote.unitPriceCents(), line.quantity, line.amount, now, now);
        }
        outboxService.append("order", orderId, "order.created", "{\"orderId\":\"" + orderId + "\",\"amountCents\":" + amount + "}");
        return find(orderId);
    }

    public com.agritainmen.order.web.OrderController.OrderPage list(String buyerId, int page, int pageSize) {
        String normalized = buyerId == null ? "" : buyerId.trim();
        String where = normalized.isBlank() ? " where deleted=false" : " where deleted=false and buyer_id=?";
        Object[] args = normalized.isBlank() ? new Object[0] : new Object[]{normalized};
        Long total = jdbc.queryForObject("select count(*) from trade_order" + where, Long.class, args);
        Object[] pageArgs = new Object[args.length + 2];
        System.arraycopy(args, 0, pageArgs, 0, args.length);
        pageArgs[args.length] = pageSize;
        pageArgs[args.length + 1] = (page - 1) * pageSize;
        List<OrderView> items = jdbc.query("select id, order_no, buyer_id, status, amount_cents, reservation_id, receiver, receiver_phone, address, created_at from trade_order" + where + " order by created_at, id limit ? offset ?",
                (rs, rowNum) -> toView(mapOrder(rs)), pageArgs);
        return new com.agritainmen.order.web.OrderController.OrderPage(items, page, pageSize, total == null ? 0 : total);
    }

    public OrderView find(String orderId) {
        List<OrderRow> rows = jdbc.query("select * from trade_order where id=? and tenant_id='PLATFORM' and deleted=false", (rs, rowNum) -> mapOrder(rs), orderId);
        if (rows.isEmpty()) throw new BusinessException(ErrorCode.NOT_FOUND, "订单不存在");
        return toView(rows.get(0));
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
                rs.getString("address"), rs.getTimestamp("created_at").toInstant());
    }

    private record QuotedLine(PriceQuote quote, int quantity, long amount) {}
    private record OrderRow(String id, String orderNo, String buyerId, String status, long amountCents, String reservationId,
                            String receiver, String receiverPhone, String address, Instant createdAt) {}
}

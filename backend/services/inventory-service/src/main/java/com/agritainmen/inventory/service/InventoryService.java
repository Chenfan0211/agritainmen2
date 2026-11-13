package com.agritainmen.inventory.service;

import com.agritainmen.common.core.BusinessException;
import com.agritainmen.common.core.ErrorCode;
import com.agritainmen.common.core.Ids;
import com.agritainmen.common.data.IdempotencyRecord;
import com.agritainmen.common.data.IdempotencyService;
import com.agritainmen.common.event.OutboxService;
import com.agritainmen.inventory.web.InventoryDtos.ReservationView;
import com.agritainmen.inventory.web.InventoryDtos.ReserveLine;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;

@Service
public class InventoryService {
    private static final String RESERVE_SCENE = "inventory.reserve";
    private final JdbcTemplate jdbc;
    private final OutboxService outboxService;
    private final IdempotencyService idempotencyService;

    public InventoryService(JdbcTemplate jdbc, OutboxService outboxService, IdempotencyService idempotencyService) {
        this.jdbc = jdbc;
        this.outboxService = outboxService;
        this.idempotencyService = idempotencyService;
    }

    @Transactional
    public ReservationView reserve(String orderId, List<ReserveLine> items, Instant expiresAt, String idempotencyKey) {
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Idempotency-Key 不能为空");
        }
        if (orderId == null || orderId.isBlank()) throw new BusinessException(ErrorCode.BAD_REQUEST, "orderId 不能为空");
        String body = requestBody(orderId, items, expiresAt);
        IdempotencyRecord existing = idempotencyService.find(RESERVE_SCENE, idempotencyKey);
        if (existing != null) {
            if (!hash(body).equals(existing.getRequestHash())) {
                throw new BusinessException(ErrorCode.IDEMPOTENCY_CONFLICT);
            }
            ReservationView replayed = findReservationByOrder(orderId);
            if (replayed != null) return replayed;
            return reserveImpl(orderId, items, expiresAt);
        }
        return idempotencyService.execute(RESERVE_SCENE, idempotencyKey, body, () -> reserveImpl(orderId, items, expiresAt));
    }

    @Transactional
    public ReservationView reserveImpl(String orderId, List<ReserveLine> items, Instant expiresAt) {
        ReservationView existing = findReservationByOrder(orderId);
        if (existing != null) return existing;
        String reservationId = Ids.uuid("RES");
        Instant now = Instant.now();
        Instant effectiveExpiry = expiresAt == null ? now.plusSeconds(1800) : expiresAt;
        jdbc.update("""
                insert into inventory_reservation(id, tenant_id, reservation_no, order_id, status, expires_at, created_at, updated_at, version, deleted)
                values (?, 'PLATFORM', ?, ?, 'RESERVED', ?, ?, ?, 0, false)
                """, reservationId, "R-" + reservationId, orderId, effectiveExpiry, now, now);
        for (ReserveLine line : items) {
            int updated = jdbc.update("""
                    update inventory_stock
                       set available_qty = available_qty - ?, reserved_qty = reserved_qty + ?, version = version + 1, updated_at = ?
                     where tenant_id = 'PLATFORM' and sku_id = ? and deleted = false and available_qty >= ?
                    """, line.quantity(), line.quantity(), now, line.skuId(), line.quantity());
            if (updated != 1) throw new BusinessException(ErrorCode.OUT_OF_STOCK, line.skuId() + " 库存不足");
            jdbc.update("""
                    insert into inventory_reservation_item(id, tenant_id, reservation_id, sku_id, quantity, created_at, updated_at, version, deleted)
                    values (?, 'PLATFORM', ?, ?, ?, ?, ?, 0, false)
                    """, Ids.uuid("RESITEM"), reservationId, line.skuId(), line.quantity(), now, now);
            jdbc.update("""
                    insert into inventory_ledger(id, tenant_id, sku_id, change_type, quantity, reference_id, created_at)
                    values (?, 'PLATFORM', ?, 'RESERVE', ?, ?, ?)
                    """, Ids.uuid("LEDGER"), line.skuId(), -line.quantity(), orderId, now);
        }
        outboxService.append("reservation", reservationId, "inventory.reserved", "{\"reservationId\":\"" + reservationId + "\",\"orderId\":\"" + orderId + "\"}");
        return findReservation(reservationId);
    }

    @Transactional
    public ReservationView release(String reservationId) {
        ReservationView current = findReservation(reservationId);
        if (current == null) throw new BusinessException(ErrorCode.NOT_FOUND, "预占记录不存在");
        if ("RELEASED".equals(current.status())) return current;
        if (!"RESERVED".equals(current.status())) throw new BusinessException(ErrorCode.CONFLICT, "当前预占状态不可释放");
        Instant now = Instant.now();
        int transitioned = jdbc.update("update inventory_reservation set status = 'RELEASED', updated_at = ?, version = version + 1 where id = ? and status = 'RESERVED'", now, reservationId);
        if (transitioned != 1) throw new BusinessException(ErrorCode.CONFLICT, "预占状态已变化，请重试");
        for (ReserveLine line : current.items()) {
            int updated = jdbc.update("""
                    update inventory_stock
                       set available_qty = available_qty + ?, reserved_qty = reserved_qty - ?, version = version + 1, updated_at = ?
                     where tenant_id = 'PLATFORM' and sku_id = ? and reserved_qty >= ?
                    """, line.quantity(), line.quantity(), now, line.skuId(), line.quantity());
            if (updated != 1) throw new BusinessException(ErrorCode.CONFLICT, "预占库存与记录不一致");
        }
        return findReservation(reservationId);
    }

    @Transactional
    public ReservationView confirm(String reservationId) {
        ReservationView current = findReservation(reservationId);
        if (current == null) throw new BusinessException(ErrorCode.NOT_FOUND, "预占记录不存在");
        if ("CONFIRMED".equals(current.status())) return current;
        if (!"RESERVED".equals(current.status())) throw new BusinessException(ErrorCode.CONFLICT, "当前预占状态不可确认");
        Instant now = Instant.now();
        int transitioned = jdbc.update("update inventory_reservation set status = 'CONFIRMED', updated_at = ?, version = version + 1 where id = ? and status = 'RESERVED'", now, reservationId);
        if (transitioned != 1) throw new BusinessException(ErrorCode.CONFLICT, "预占状态已变化，请重试");
        for (ReserveLine line : current.items()) {
            int updated = jdbc.update("""
                    update inventory_stock
                       set reserved_qty = reserved_qty - ?, version = version + 1, updated_at = ?
                     where tenant_id = 'PLATFORM' and sku_id = ? and reserved_qty >= ?
                    """, line.quantity(), now, line.skuId(), line.quantity());
            if (updated != 1) throw new BusinessException(ErrorCode.CONFLICT, "预占库存与记录不一致");
            jdbc.update("""
                    insert into inventory_ledger(id, tenant_id, sku_id, change_type, quantity, reference_id, created_at)
                    values (?, 'PLATFORM', ?, 'SALE', ?, ?, ?)
                    """, Ids.uuid("LEDGER"), line.skuId(), -line.quantity(), reservationId, now);
        }
        return findReservation(reservationId);
    }

    @Transactional
    public void adjust(String skuId, int delta, String reason) {
        if (skuId == null || skuId.isBlank()) throw new BusinessException(ErrorCode.BAD_REQUEST, "skuId 不能为空");
        if (delta == 0) throw new BusinessException(ErrorCode.BAD_REQUEST, "delta 不能为 0");
        Instant now = Instant.now();
        jdbc.update("""
                insert into inventory_stock(id, tenant_id, sku_id, available_qty, reserved_qty, created_at, updated_at, version, deleted)
                values (?, 'PLATFORM', ?, 0, 0, ?, ?, 0, false)
                on duplicate key update sku_id = sku_id
                """, Ids.uuid("STOCK"), skuId, now, now);
        int updated = jdbc.update("""
                update inventory_stock set available_qty = available_qty + ?, version = version + 1, updated_at = ?
                 where tenant_id = 'PLATFORM' and sku_id = ? and available_qty + ? >= 0
                """, delta, now, skuId, delta);
        if (updated != 1) throw new BusinessException(ErrorCode.CONFLICT, "库存调整后不能为负数");
        jdbc.update("""
                insert into inventory_ledger(id, tenant_id, sku_id, change_type, quantity, reference_id, created_at)
                values (?, 'PLATFORM', ?, 'ADJUST', ?, ?, ?)
                """, Ids.uuid("LEDGER"), skuId, delta, reason, now);
    }

    public ReservationView findReservationByOrder(String orderId) {
        List<String> ids = jdbc.query("select id from inventory_reservation where tenant_id='PLATFORM' and order_id=? and deleted=false limit 1", (rs, rowNum) -> rs.getString(1), orderId);
        return ids.isEmpty() ? null : findReservation(ids.get(0));
    }

    public ReservationView findReservation(String id) {
        List<ReservationRow> rows = jdbc.query("select id, order_id, status, expires_at, created_at from inventory_reservation where id=? and tenant_id='PLATFORM' and deleted=false", (rs, rowNum) -> mapReservation(rs), id);
        if (rows.isEmpty()) return null;
        ReservationRow row = rows.get(0);
        List<ReserveLine> items = jdbc.query("select sku_id, quantity from inventory_reservation_item where reservation_id=? and deleted=false order by sku_id", (rs, rowNum) -> new ReserveLine(rs.getString(1), rs.getInt(2)), id);
        return new ReservationView(row.id, row.orderId, row.status, items, row.expiresAt, row.createdAt);
    }

    public int available(String skuId) {
        List<Integer> values = jdbc.query("select available_qty from inventory_stock where tenant_id='PLATFORM' and sku_id=?", (rs, rowNum) -> rs.getInt(1), skuId);
        return values.isEmpty() ? 0 : values.get(0);
    }

    private String requestBody(String orderId, List<ReserveLine> items, Instant expiresAt) {
        return orderId + "|" + items + "|" + expiresAt;
    }

    private String hash(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private ReservationRow mapReservation(ResultSet rs) throws SQLException {
        return new ReservationRow(rs.getString("id"), rs.getString("order_id"), rs.getString("status"), rs.getTimestamp("expires_at").toInstant(), rs.getTimestamp("created_at").toInstant());
    }

    private record ReservationRow(String id, String orderId, String status, Instant expiresAt, Instant createdAt) {}
}

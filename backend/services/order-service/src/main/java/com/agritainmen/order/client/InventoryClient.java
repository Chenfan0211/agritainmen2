package com.agritainmen.order.client;

import java.time.Instant;
import java.util.List;

public interface InventoryClient {
    Reservation reserve(String orderId, List<Line> lines, Instant expiresAt);
    Reservation release(String reservationId);
    record Line(String skuId, int quantity) {}
    record Reservation(String id, String orderId, String status) {}
    record ReservePayload(String orderId, List<Line> items, Instant expiresAt) {}
}

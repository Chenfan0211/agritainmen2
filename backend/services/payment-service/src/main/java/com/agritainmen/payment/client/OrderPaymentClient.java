package com.agritainmen.payment.client;

public interface OrderPaymentClient {
    OrderSnapshot load(String orderId, String authorization);
    String confirm(String orderId, long amountCents);

    record OrderSnapshot(String id, long amountCents, String status) {}
}

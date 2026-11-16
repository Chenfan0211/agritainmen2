package com.agritainmen.payment.provider;

public interface PaymentProvider {
    ProviderIntent createIntent(String orderId, long amountCents, String channel);
    boolean verifyCallback(String providerTxnId, long amountCents);
    boolean refund(String providerTxnId, String refundRequestId, long amountCents);
    record ProviderIntent(String provider, String providerTxnId, String paymentParams) {}
}

package com.agritainmen.payment.provider;

import com.agritainmen.common.core.Ids;

public class SandboxPaymentProvider implements PaymentProvider {
    @Override
    public ProviderIntent createIntent(String orderId, long amountCents, String channel) {
        return new ProviderIntent("sandbox", Ids.uuid("SANDBOX-PAY"), "{\"orderId\":\"" + orderId + "\",\"amountCents\":" + amountCents + "}");
    }
    @Override
    public boolean verifyCallback(String providerTxnId, long amountCents) {
        return providerTxnId != null && !providerTxnId.isBlank() && amountCents > 0;
    }

    @Override
    public boolean refund(String providerTxnId, String refundRequestId, long amountCents) {
        return providerTxnId != null && !providerTxnId.isBlank()
                && refundRequestId != null && !refundRequestId.isBlank() && amountCents > 0;
    }
}

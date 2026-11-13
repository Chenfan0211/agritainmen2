package com.agritainmen.payment.provider;

import com.agritainmen.common.core.BusinessException;
import com.agritainmen.common.core.ErrorCode;

public class WechatV3PaymentProvider implements PaymentProvider {
    @Override
    public ProviderIntent createIntent(String orderId, long amountCents, String channel) {
        throw new BusinessException(ErrorCode.INTERNAL_ERROR, "微信支付 V3 尚未配置商户证书");
    }
    @Override
    public boolean verifyCallback(String providerTxnId, long amountCents) {
        throw new BusinessException(ErrorCode.INTERNAL_ERROR, "微信支付 V3 尚未配置平台证书");
    }
}

package com.agritainmen.common.core;

import java.math.BigDecimal;
import java.math.RoundingMode;

public final class Money {
    private Money() {
    }

    public static long fromYuan(BigDecimal yuan) {
        if (yuan == null) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "金额不能为空");
        }
        return yuan.movePointRight(2).setScale(0, RoundingMode.HALF_UP).longValueExact();
    }

    public static BigDecimal toYuan(long cents) {
        return BigDecimal.valueOf(cents).movePointLeft(2);
    }
}

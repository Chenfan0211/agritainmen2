package com.agritainmen.common.core;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;

class MoneyTest {
    @Test
    void convertsYuanAndCentsWithoutFloatingPointErrors() {
        assertEquals(5990L, Money.fromYuan(new BigDecimal("59.90")));
        assertEquals(new BigDecimal("59.90"), Money.toYuan(5990L));
    }
}

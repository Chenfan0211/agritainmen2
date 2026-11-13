package com.agritainmen.settlement;

import com.agritainmen.common.core.BusinessException;
import com.agritainmen.settlement.service.SettlementService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

@SpringBootTest(properties = "spring.profiles.active=test")
class SettlementServiceTest {
    @Autowired
    private SettlementService settlementService;

    @Test
    void withdrawalCanOnlyBeReviewedOnce() {
        var withdrawal = settlementService.requestWithdrawal("T001", 20000, "微信零钱");
        assertEquals("APPROVED", settlementService.reviewWithdrawal(withdrawal.id(), true, "admin", "核对通过").status());
        assertThrows(BusinessException.class, () -> settlementService.reviewWithdrawal(withdrawal.id(), false, "reviewer", "重复处理"));
    }

    @Test
    void commissionSourceIsIdempotent() {
        var first = settlementService.addCommission("SUB-1", "T001", 500, "LEVEL_1");
        var second = settlementService.addCommission("SUB-1", "T001", 500, "LEVEL_1");
        assertEquals(first.id(), second.id());
    }
}

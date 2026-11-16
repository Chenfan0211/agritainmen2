package com.agritainmen.settlement;

import com.agritainmen.common.core.BusinessException;
import com.agritainmen.settlement.service.SettlementService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

@SpringBootTest(properties = "spring.profiles.active=test")
class SettlementServiceTest {
    @Autowired
    private SettlementService settlementService;

    @Autowired
    private JdbcTemplate jdbc;

    @Test
    void withdrawalCanOnlyBeReviewedOnce() {
        var withdrawal = settlementService.requestWithdrawal("T001", 20000, "微信零钱", UUID.randomUUID().toString());
        assertEquals("APPROVED", settlementService.reviewWithdrawal(withdrawal.id(), true, "admin", "核对通过").status());
        assertThrows(BusinessException.class, () -> settlementService.reviewWithdrawal(withdrawal.id(), false, "reviewer", "重复处理"));
    }

    @Test
    void commissionSourceIsIdempotent() {
        var first = settlementService.addCommission("SUB-1", "T001", 500, "LEVEL_1");
        var second = settlementService.addCommission("SUB-1", "T001", 500, "LEVEL_1");
        assertEquals(first.id(), second.id());
    }

    @Test
    void concurrentWithdrawalRequestsWithSameKeyCreateOneRow() throws Exception {
        String requesterId = "T-" + UUID.randomUUID();
        String key = UUID.randomUUID().toString();
        var start = new CountDownLatch(1);
        var executor = Executors.newFixedThreadPool(2);
        try {
            var first = executor.submit(() -> { start.await(); return settlementService.requestWithdrawal(requesterId, 20000, "WECHAT", key); });
            var second = executor.submit(() -> { start.await(); return settlementService.requestWithdrawal(requesterId, 20000, "WECHAT", key); });
            start.countDown();
            assertEquals(first.get(10, TimeUnit.SECONDS).id(), second.get(10, TimeUnit.SECONDS).id());
            assertEquals(1, jdbc.queryForObject("select count(*) from settlement_withdrawal where requester_id=?", Integer.class, requesterId));
        } finally {
            executor.shutdownNow();
        }
    }
}

package com.agritainmen.fulfillment;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(properties = "spring.profiles.active=test")
class FulfillmentUniqueScopeTest {
    @Autowired JdbcTemplate jdbc;

    @Test
    @Transactional
    void oneOrderCanHaveOneFulfillmentPerSupplier() {
        String orderId = "O-MULTI-" + UUID.randomUUID();
        insert("F-MULTI-1-" + UUID.randomUUID(), orderId, "S1");
        insert("F-MULTI-2-" + UUID.randomUUID(), orderId, "S2");
        assertEquals(2, jdbc.queryForObject("select count(*) from fulfillment_order where order_id=?", Integer.class, orderId));
        assertThrows(DuplicateKeyException.class,
                () -> insert("F-MULTI-3-" + UUID.randomUUID(), orderId, "S1"));
    }

    private void insert(String id, String orderId, String supplierId) {
        jdbc.update("insert into fulfillment_order(id,tenant_id,order_id,supplier_id,status,created_at,updated_at,version,deleted) values (?, 'PLATFORM', ?, ?, 'PENDING', current_timestamp, current_timestamp, 0, false)",
                id, orderId, supplierId);
    }
}

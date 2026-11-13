package com.agritainmen.inventory;

import com.agritainmen.common.core.BusinessException;
import com.agritainmen.inventory.service.InventoryService;
import com.agritainmen.inventory.web.InventoryDtos.ReserveLine;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.IntStream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

@SpringBootTest(properties = "spring.profiles.active=test")
class InventoryConcurrencyTest {
    @Autowired
    private InventoryService inventoryService;
    @Autowired
    private JdbcTemplate jdbc;

    @BeforeEach
    void reset() {
        jdbc.update("delete from inventory_ledger");
        jdbc.update("delete from inventory_reservation_item");
        jdbc.update("delete from inventory_reservation");
        jdbc.update("delete from inventory_stock");
        jdbc.update("delete from sys_outbox_event");
        jdbc.update("delete from sys_idempotency_record");
        jdbc.update("""
                insert into inventory_stock(id, tenant_id, sku_id, available_qty, reserved_qty, created_at, updated_at, version, deleted)
                values ('STOCK-1', 'PLATFORM', 'SKU-1', 1, 0, current_timestamp, current_timestamp, 0, false)
                """);
    }

    @Test
    void exactlyOneReservationWinsForOneUnitUnderConcurrency() throws Exception {
        AtomicInteger success = new AtomicInteger();
        AtomicInteger outOfStock = new AtomicInteger();
        try (var executor = Executors.newFixedThreadPool(32)) {
            List<Callable<Void>> tasks = IntStream.range(0, 100).mapToObj(index -> (Callable<Void>) () -> {
                try {
                    inventoryService.reserve("ORDER-" + index, List.of(new ReserveLine("SKU-1", 1)), null, "IDEM-" + index);
                    success.incrementAndGet();
                } catch (Exception exception) {
                    outOfStock.incrementAndGet();
                }
                return null;
            }).toList();
            for (var future : executor.invokeAll(tasks)) future.get();
        }
        assertEquals(1, success.get());
        assertEquals(99, outOfStock.get());
        assertEquals(0, inventoryService.available("SKU-1"));
        Integer reserved = jdbc.queryForObject("select reserved_qty from inventory_stock where sku_id='SKU-1'", Integer.class);
        assertEquals(1, reserved);
    }

    @Test
    void releaseAndConfirmAreIdempotent() {
        var reservation = inventoryService.reserve("ORDER-A", List.of(new ReserveLine("SKU-1", 1)), null, "IDEM-A");
        assertEquals("RESERVED", reservation.status());
        assertEquals("RELEASED", inventoryService.release(reservation.id()).status());
        assertEquals("RELEASED", inventoryService.release(reservation.id()).status());
        assertEquals(1, inventoryService.available("SKU-1"));
    }

    @Test
    void releaseMustNotChangeReservationWhenReservedStockCannotBeUpdated() {
        var reservation = inventoryService.reserve("ORDER-R", List.of(new ReserveLine("SKU-1", 1)), null, "IDEM-R");
        jdbc.update("update inventory_stock set reserved_qty=0 where sku_id='SKU-1'");
        assertThrows(BusinessException.class, () -> inventoryService.release(reservation.id()));
        assertEquals("RESERVED", jdbc.queryForObject("select status from inventory_reservation where id=?", String.class, reservation.id()));
    }

    @Test
    void confirmMustNotChangeReservationWhenReservedStockCannotBeUpdated() {
        var reservation = inventoryService.reserve("ORDER-C", List.of(new ReserveLine("SKU-1", 1)), null, "IDEM-C");
        jdbc.update("update inventory_stock set reserved_qty=0 where sku_id='SKU-1'");
        assertThrows(BusinessException.class, () -> inventoryService.confirm(reservation.id()));
        assertEquals("RESERVED", jdbc.queryForObject("select status from inventory_reservation where id=?", String.class, reservation.id()));
        assertEquals(0, jdbc.queryForObject("select count(*) from inventory_ledger where change_type='SALE'", Integer.class));
    }
}

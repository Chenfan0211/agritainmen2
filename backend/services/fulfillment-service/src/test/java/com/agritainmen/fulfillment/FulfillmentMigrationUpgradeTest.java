package com.agritainmen.fulfillment;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;

import java.sql.DriverManager;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;

class FulfillmentMigrationUpgradeTest {
    @Test void upgradePreservesExistingFulfillmentAndAllowsAnotherSupplier() throws Exception {
        String url = "jdbc:h2:mem:fulfillment_upgrade_" + UUID.randomUUID()
                + ";MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1";
        Flyway.configure().dataSource(url, "sa", "").locations("classpath:db/migration").target("2").load().migrate();
        try (var connection = DriverManager.getConnection(url, "sa", ""); var statement = connection.createStatement()) {
            statement.execute("insert into fulfillment_order(id,tenant_id,order_id,supplier_id,status,created_at,updated_at,version,deleted) values ('F-HISTORY','PLATFORM','O-HISTORY','S1','ACCEPTED',current_timestamp,current_timestamp,0,false)");
        }
        Flyway.configure().dataSource(url, "sa", "").locations("classpath:db/migration").load().migrate();
        try (var connection = DriverManager.getConnection(url, "sa", ""); var statement = connection.createStatement()) {
            try (var rows = statement.executeQuery("select supplier_id, status from fulfillment_order where id='F-HISTORY'")) {
                rows.next();
                assertEquals("S1", rows.getString("supplier_id"));
                assertEquals("ACCEPTED", rows.getString("status"));
            }
            statement.execute("insert into fulfillment_order(id,tenant_id,order_id,supplier_id,status,created_at,updated_at,version,deleted) values ('F-NEW','PLATFORM','O-HISTORY','S2','PENDING',current_timestamp,current_timestamp,0,false)");
            try (var rows = statement.executeQuery("select count(*) from fulfillment_order where order_id='O-HISTORY'")) {
                rows.next();
                assertEquals(2, rows.getInt(1));
            }
        }
    }
}

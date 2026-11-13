package com.agritainmen.order.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class DemoOrderSeeder implements ApplicationRunner {
    private final JdbcTemplate jdbc;
    private final boolean enabled;
    public DemoOrderSeeder(JdbcTemplate jdbc, @Value("${agritainmen.demo.seed-enabled:false}") boolean enabled) { this.jdbc = jdbc; this.enabled = enabled; }
    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (!enabled) return;
        if (count("trade_order", "ORDER-DEMO-001") > 0) return;
        jdbc.update("insert into trade_order(id,tenant_id,order_no,buyer_id,status,amount_cents,reservation_id,receiver,receiver_phone,address,created_at,updated_at,version,deleted) values ('ORDER-DEMO-001','PLATFORM','C-MALL-DEMO-001','U-DEMO-NORMAL','PENDING_PAYMENT',5990,'RES-DEMO-001','演示用户','13800000000','湖南省长沙市演示地址',current_timestamp,current_timestamp,0,false)");
        jdbc.update("insert into trade_order_item(id,tenant_id,order_id,sku_id,product_id,supplier_id,product_name,unit_price_cents,quantity,amount_cents,created_at,updated_at,version,deleted) values ('OITEM-DEMO-001','PLATFORM','ORDER-DEMO-001','SKU-DEMO-001','P-DEMO-001','S-DEMO-001','演示生鲜礼盒',5990,1,5990,current_timestamp,current_timestamp,0,false)");
    }
    private int count(String table, String id) {
        Integer value = jdbc.queryForObject("select count(*) from " + table + " where id=?", Integer.class, id);
        return value == null ? 0 : value;
    }
}

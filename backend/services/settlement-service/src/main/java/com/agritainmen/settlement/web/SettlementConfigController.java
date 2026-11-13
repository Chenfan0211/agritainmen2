package com.agritainmen.settlement.web;

import com.agritainmen.common.core.ApiResponse;
import com.agritainmen.common.core.Ids;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1")
public class SettlementConfigController {
    private final JdbcTemplate jdbc;
    public SettlementConfigController(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    public record CommissionRuleRequest(String name, Double promoterRate, Double storeRate, Boolean enabled) {}
    public record ShareConfigRequest(Double promoterRate, Double staffRate, Double leaderLevel1Rate, Double leaderLevel2Rate) {}
    @PutMapping("/commissions/rules/{id}")
    public ApiResponse<Map<String, Object>> updateRule(@PathVariable String id, @RequestBody CommissionRuleRequest request) {
        Integer count = jdbc.queryForObject("select count(*) from settlement_commission_rule where id=? and deleted=false", Integer.class, id);
        if (count == null || count == 0) {
            jdbc.update("insert into settlement_commission_rule(id,tenant_id,name,promoter_rate,store_rate,enabled,created_at,updated_at,version,deleted) values (?, 'PLATFORM', ?, ?, ?, ?, current_timestamp, current_timestamp, 0, false)",
                    id, request.name() == null ? "默认规则" : request.name(), request.promoterRate() == null ? 0 : request.promoterRate(),
                    request.storeRate() == null ? 0 : request.storeRate(), request.enabled() == null || request.enabled());
        } else {
            jdbc.update("update settlement_commission_rule set name=?, promoter_rate=?, store_rate=?, enabled=?, updated_at=current_timestamp, version=version+1 where id=?",
                    request.name(), request.promoterRate(), request.storeRate(), request.enabled() == null || request.enabled(), id);
        }
        return ApiResponse.ok(jdbc.queryForMap("select id, name, promoter_rate, store_rate, enabled from settlement_commission_rule where id=?", id));
    }
    @PutMapping("/commissions/share-config")
    public ApiResponse<Map<String, Object>> updateShareConfig(@RequestBody ShareConfigRequest request) {
        Integer count = jdbc.queryForObject("select count(*) from settlement_share_config where deleted=false", Integer.class);
        if (count == null || count == 0) {
            jdbc.update("insert into settlement_share_config(id,tenant_id,promoter_rate,staff_rate,leader_level1_rate,leader_level2_rate,created_at,updated_at,version,deleted) values (?, 'PLATFORM', ?, ?, ?, ?, current_timestamp, current_timestamp, 0, false)",
                    Ids.uuid("SHARE"), request.promoterRate(), request.staffRate(), request.leaderLevel1Rate(), request.leaderLevel2Rate());
        } else {
            jdbc.update("update settlement_share_config set promoter_rate=?, staff_rate=?, leader_level1_rate=?, leader_level2_rate=?, updated_at=current_timestamp, version=version+1 where deleted=false",
                    request.promoterRate(), request.staffRate(), request.leaderLevel1Rate(), request.leaderLevel2Rate());
        }
        return ApiResponse.ok(jdbc.queryForMap("select id, promoter_rate, staff_rate, leader_level1_rate, leader_level2_rate from settlement_share_config where deleted=false limit 1"));
    }
}

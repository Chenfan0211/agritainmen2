package com.agritainmen.admin.web;

import com.agritainmen.common.core.ApiResponse;
import com.agritainmen.common.core.Ids;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.Valid;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/admin")
public class AdminPlatformController {
    private final JdbcTemplate jdbc;
    public AdminPlatformController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public record AuditRequest(@NotBlank String actorId, @NotBlank String actorRole, @NotBlank String module, @NotBlank String action, String targetId, String result, String reason) {}
    public record DashboardView(long gmvCents, long orderCount, long supplierCount, long farmCount, long pendingAuditCount) {}
    public record ReportPage(List<Map<String, Object>> items, int page, int pageSize, long total) {}

    @PostMapping("/audit")
    public ApiResponse<String> audit(@Valid @RequestBody AuditRequest request) {
        String id = Ids.uuid("AUDIT");
        jdbc.update("""
                insert into admin_audit_log(id,tenant_id,actor_id,actor_role,module,action,target_id,result,reason,created_at)
                values (?, 'PLATFORM', ?, ?, ?, ?, ?, ?, ?, current_timestamp)
                """, id, request.actorId(), request.actorRole(), request.module(), request.action(), request.targetId(), request.result(), request.reason());
        return ApiResponse.ok(id);
    }

    @GetMapping("/audit")
    public ApiResponse<List<Map<String, Object>>> auditList() {
        return ApiResponse.ok(jdbc.queryForList("select id, actor_id, actor_role, module, action, target_id, result, reason, created_at from admin_audit_log order by created_at desc limit 200"));
    }

    @GetMapping("/dictionaries")
    public ApiResponse<List<Map<String, Object>>> dictionaries() {
        return ApiResponse.ok(jdbc.queryForList("select group_code, item_code, label, sort_order, enabled from admin_dictionary where deleted=false order by group_code, sort_order"));
    }

    @GetMapping("/dashboard")
    public ApiResponse<DashboardView> dashboard() {
        long gmv = number("select coalesce(sum(gmv_cents),0) from trade_order_daily where deleted=false");
        long orders = number("select coalesce(sum(order_count),0) from trade_order_daily where deleted=false");
        long suppliers = number("select coalesce(count(*),0) from org_supplier_daily where deleted=false");
        long farms = number("select coalesce(count(*),0) from org_farm_daily where deleted=false");
        long pending = number("select coalesce(count(*),0) from admin_audit_log where result='failure'");
        return ApiResponse.ok(new DashboardView(gmv, orders, suppliers, farms, pending));
    }

    @GetMapping("/reports")
    public ApiResponse<ReportPage> reports(@RequestParam(required = false) String from,
                                           @RequestParam(required = false) String to,
                                           @RequestParam(defaultValue = "1") int page,
                                           @RequestParam(defaultValue = "20") int pageSize) {
        if (page < 1 || pageSize < 1 || pageSize > 200) throw new com.agritainmen.common.core.BusinessException(com.agritainmen.common.core.ErrorCode.BAD_REQUEST, "page 必须大于 0，pageSize 必须在 1-200 之间");
        List<Map<String, Object>> items = jdbc.queryForList("select * from trade_order_daily where deleted=false order by order_date desc limit ? offset ?", pageSize, (page - 1) * pageSize);
        long total = number("select coalesce(count(*),0) from trade_order_daily where deleted=false");
        return ApiResponse.ok(new ReportPage(items, page, pageSize, total));
    }

    private long number(String sql) {
        Long value = jdbc.queryForObject(sql, Long.class);
        return value == null ? 0 : value;
    }
}

package com.agritainmen.org.web;

import com.agritainmen.common.core.ApiResponse;
import com.agritainmen.org.service.OrgProfiles;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/org")
public class OrgController {
    private final JdbcTemplate jdbc;
    private final OrgProfiles profiles;
    public OrgController(JdbcTemplate jdbc, OrgProfiles profiles) { this.jdbc = jdbc; this.profiles = profiles; }

    @GetMapping("/suppliers")
    public ApiResponse<List<Map<String, Object>>> suppliers() {
        return ApiResponse.ok(profiles.suppliers());
    }

    @GetMapping("/suppliers/{id}")
    public ApiResponse<Map<String, Object>> supplier(@PathVariable String id) {
        return ApiResponse.ok(profiles.supplier(id));
    }

    @GetMapping("/farms")
    public ApiResponse<List<Map<String, Object>>> farms() {
        return ApiResponse.ok(profiles.farms());
    }

    @GetMapping("/farms/{id}")
    public ApiResponse<Map<String, Object>> farm(@PathVariable String id) {
        return ApiResponse.ok(profiles.farm(id));
    }

    @GetMapping("/drivers")
    public ApiResponse<List<Map<String, Object>>> drivers() {
        return ApiResponse.ok(jdbc.queryForList("select id, supplier_id, name, phone, status from org_driver where deleted=false order by name"));
    }

    @GetMapping("/leaders")
    public ApiResponse<List<Map<String, Object>>> leaders() {
        return ApiResponse.ok(jdbc.queryForList("select id, name, level, leader_id, status from org_leader where deleted=false order by name"));
    }

    @GetMapping("/users")
    public ApiResponse<PageView> users(@RequestParam(defaultValue = "1") int page, @RequestParam(defaultValue = "20") int pageSize) {
        if (page < 1 || pageSize < 1 || pageSize > 200) throw new com.agritainmen.common.core.BusinessException(com.agritainmen.common.core.ErrorCode.BAD_REQUEST, "page 必须大于 0，pageSize 必须在 1-200 之间");
        Long total = jdbc.queryForObject("select count(*) from org_user where deleted=false", Long.class);
        List<Map<String, Object>> items = jdbc.queryForList("select id, nickname, phone, level, leader_id, parent_leader_id, source_channel, status from org_user where deleted=false order by created_at, id limit ? offset ?", pageSize, (page - 1) * pageSize);
        return ApiResponse.ok(new PageView(items, page, pageSize, total == null ? 0 : total));
    }

    public record PageView(List<Map<String, Object>> items, int page, int pageSize, long total) {}
}

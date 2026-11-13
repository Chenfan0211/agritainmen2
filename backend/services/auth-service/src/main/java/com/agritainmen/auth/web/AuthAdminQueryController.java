package com.agritainmen.auth.web;

import com.agritainmen.common.core.ApiResponse;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/auth/admin")
public class AuthAdminQueryController {
    private final JdbcTemplate jdbc;
    public AuthAdminQueryController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @GetMapping("/roles")
    public ApiResponse<List<Map<String, Object>>> roles() {
        return ApiResponse.ok(jdbc.queryForList("select id, code, name, permissions_json, system_role, enabled from auth_role where deleted=false order by code"));
    }

    @GetMapping("/accounts")
    public ApiResponse<List<Map<String, Object>>> accounts() {
        return ApiResponse.ok(jdbc.queryForList("""
                select a.id, a.account, a.display_name, a.enabled,
                       (select r.code from auth_account_role ar join auth_role r on r.id = ar.role_id
                         where ar.account_id = a.id and ar.deleted = false and ar.enabled = true limit 1) role_code
                  from auth_account a where a.deleted=false order by a.account
                """));
    }
}

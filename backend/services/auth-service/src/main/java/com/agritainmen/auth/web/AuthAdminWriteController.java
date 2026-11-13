package com.agritainmen.auth.web;

import com.agritainmen.common.core.ApiResponse;
import com.agritainmen.common.core.BusinessException;
import com.agritainmen.common.core.ErrorCode;
import com.agritainmen.common.core.Ids;
import com.agritainmen.common.security.TokenClaims;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/auth/admin")
public class AuthAdminWriteController {
    private final JdbcTemplate jdbc;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
    public AuthAdminWriteController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public record RoleRequest(@NotBlank String code, @NotBlank String name, List<String> permissions, Boolean enabled) {}
    public record RolePatch(String name, Boolean enabled) {}
    public record PermissionRequest(List<String> permissions) {}
    public record AccountRequest(@NotBlank String account, @NotBlank String password, @NotBlank String displayName, @NotBlank String roleId) {}
    public record AccountPatch(String password, String displayName, String roleId, Boolean enabled) {}

    @PostMapping("/roles")
    @Transactional
    public ApiResponse<Map<String, Object>> createRole(@Valid @RequestBody RoleRequest request) {
        String id = Ids.uuid("ROLE");
        try {
            jdbc.update("insert into auth_role(id,tenant_id,code,name,permissions_json,system_role,enabled,created_at,updated_at,version,deleted) values (?, 'PLATFORM', ?, ?, ?, false, ?, current_timestamp, current_timestamp, 0, false)",
                    id, request.code(), request.name(), json(request.permissions()), request.enabled() == null || request.enabled());
        } catch (DuplicateKeyException duplicate) {
            throw new BusinessException(ErrorCode.CONFLICT, "角色编码已存在");
        }
        return ApiResponse.ok(findRole(id));
    }

    @PutMapping("/roles/{id}")
    public ApiResponse<Map<String, Object>> updateRole(@PathVariable String id, @RequestBody RolePatch request) {
        Map<String, Object> current = findRole(id);
        jdbc.update("update auth_role set name=?, enabled=?, updated_at=current_timestamp, version=version+1 where id=?",
                request.name() == null ? current.get("name") : request.name(),
                request.enabled() == null ? current.get("enabled") : request.enabled(), id);
        return ApiResponse.ok(findRole(id));
    }

    @PutMapping("/roles/{id}/permissions")
    public ApiResponse<Map<String, Object>> updatePermissions(@PathVariable String id, @RequestBody PermissionRequest request) {
        int updated = jdbc.update("update auth_role set permissions_json=?, updated_at=current_timestamp, version=version+1 where id=? and deleted=false", json(request.permissions()), id);
        if (updated != 1) throw new BusinessException(ErrorCode.NOT_FOUND, "角色不存在");
        return ApiResponse.ok(findRole(id));
    }

    @PostMapping("/accounts")
    @Transactional
    public ApiResponse<Map<String, Object>> createAccount(@Valid @RequestBody AccountRequest request) {
        String id = Ids.uuid("ACCOUNT");
        try {
            jdbc.update("insert into auth_account(id,tenant_id,actor_type,account,password_hash,display_name,enabled,created_at,updated_at,version,deleted) values (?, 'PLATFORM', 'admin', ?, ?, ?, true, current_timestamp, current_timestamp, 0, false)",
                    id, request.account(), encoder.encode(request.password()), request.displayName());
        } catch (DuplicateKeyException duplicate) {
            throw new BusinessException(ErrorCode.CONFLICT, "账号已存在");
        }
        jdbc.update("insert into auth_account_role(id,tenant_id,account_id,role_id,enabled,created_at,updated_at,version,deleted) values (?, 'PLATFORM', ?, ?, true, current_timestamp, current_timestamp, 0, false)",
                Ids.uuid("ACCROLE"), id, request.roleId());
        return ApiResponse.ok(findAccount(id));
    }

    @PutMapping("/accounts/{id}")
    public ApiResponse<Map<String, Object>> updateAccount(@PathVariable String id, @RequestBody AccountPatch request,
                                                           @AuthenticationPrincipal TokenClaims claims) {
        List<String> permissions = claims.permissions() == null ? List.of() : claims.permissions();
        if (!permissions.contains("*") && (((request.password() != null || request.displayName() != null || request.roleId() != null)
                && !permissions.contains("admin.account.update"))
                || (request.enabled() != null && !permissions.contains("admin.account.status"))))
            throw new BusinessException(ErrorCode.FORBIDDEN);
        Map<String, Object> current = findAccount(id);
        jdbc.update("update auth_account set password_hash=?, display_name=?, enabled=?, updated_at=current_timestamp, version=version+1 where id=?",
                request.password() == null ? jdbc.queryForObject("select password_hash from auth_account where id=?", String.class, id) : encoder.encode(request.password()),
                request.displayName() == null ? current.get("display_name") : request.displayName(),
                request.enabled() == null ? current.get("enabled") : request.enabled(), id);
        if (request.roleId() != null) {
            jdbc.update("update auth_account_role set enabled=false, updated_at=current_timestamp, version=version+1 where account_id=?", id);
            jdbc.update("insert into auth_account_role(id,tenant_id,account_id,role_id,enabled,created_at,updated_at,version,deleted) values (?, 'PLATFORM', ?, ?, true, current_timestamp, current_timestamp, 0, false)",
                    Ids.uuid("ACCROLE"), id, request.roleId());
        }
        return ApiResponse.ok(findAccount(id));
    }

    @PatchMapping("/accounts/{id}")
    public ApiResponse<Map<String, Object>> patchAccount(@PathVariable String id, @RequestBody AccountPatch request,
                                                          @AuthenticationPrincipal TokenClaims claims) {
        return updateAccount(id, request, claims);
    }

    private Map<String, Object> findRole(String id) { return jdbc.queryForMap("select id, code, name, permissions_json, system_role, enabled from auth_role where id=? and deleted=false", id); }
    private Map<String, Object> findAccount(String id) { return jdbc.queryForMap("select id, account, display_name, enabled from auth_account where id=? and deleted=false", id); }
    private String json(List<String> permissions) {
        List<String> values = permissions == null ? List.of() : permissions;
        return "[" + values.stream().map((value) -> "\"" + value.replace("\"", "\\\"") + "\"").reduce((a, b) -> a + "," + b).orElse("") + "]";
    }
}

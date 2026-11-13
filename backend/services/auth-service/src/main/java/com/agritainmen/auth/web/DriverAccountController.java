package com.agritainmen.auth.web;

import com.agritainmen.auth.service.AuthService;
import com.agritainmen.common.core.ApiResponse;
import com.agritainmen.common.core.BusinessException;
import com.agritainmen.common.core.ErrorCode;
import com.agritainmen.common.core.Ids;
import com.agritainmen.common.security.TokenClaims;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/auth/supplier/drivers")
public class DriverAccountController {
    private final JdbcTemplate jdbc;
    private final PasswordEncoder encoder;
    private final AuthService authService;

    public DriverAccountController(JdbcTemplate jdbc, PasswordEncoder encoder, AuthService authService) {
        this.jdbc = jdbc; this.encoder = encoder; this.authService = authService;
    }

    public record DriverRequest(String name, String phone, String account, String password) {}
    public record DriverPatch(String name, String phone, String password, Boolean enabled) {}
    public record DriverView(String id, String supplierId, String name, String phone, String account, boolean enabled) {}

    @GetMapping
    public ApiResponse<List<DriverView>> list(@RequestHeader(value = "Authorization", required = false) String authorization) {
        String supplierId = supplierId(authorization);
        return ApiResponse.ok(jdbc.query("""
                select id,driver_supplier_id,display_name,driver_phone,account,enabled from auth_account
                where actor_type='driver' and driver_supplier_id=? and deleted=false order by display_name,id
                """, (rs, row) -> view(rs.getString("id"), rs.getString("driver_supplier_id"),
                rs.getString("display_name"), rs.getString("driver_phone"), rs.getString("account"), rs.getBoolean("enabled")), supplierId));
    }

    @PostMapping
    @Transactional
    public ApiResponse<DriverView> create(@RequestBody DriverRequest request,
                                          @RequestHeader(value = "Authorization", required = false) String authorization) {
        String supplierId = supplierId(authorization);
        requireName(request.name());
        requirePhone(request.phone());
        requireAccount(request.account());
        requirePassword(request.password());
        String id = Ids.uuid("DRIVER");
        try {
            jdbc.update("""
                    insert into auth_account(id,tenant_id,actor_type,driver_supplier_id,driver_phone,account,password_hash,display_name,enabled,created_at,updated_at,version,deleted)
                    values (?,'PLATFORM','driver',?,?,?,?,?,true,current_timestamp,current_timestamp,0,false)
                    """, id, supplierId, request.phone().trim(), request.account().trim(), encoder.encode(request.password()), request.name().trim());
        } catch (DuplicateKeyException duplicate) {
            throw new BusinessException(ErrorCode.CONFLICT, "司机登录账号已存在");
        }
        return ApiResponse.ok(find(id, supplierId));
    }

    @PatchMapping("/{id}")
    @Transactional
    public ApiResponse<DriverView> update(@PathVariable String id, @RequestBody DriverPatch patch,
                                          @RequestHeader(value = "Authorization", required = false) String authorization) {
        String supplierId = supplierId(authorization);
        DriverView current = find(id, supplierId);
        if (patch.name() == null && patch.phone() == null && patch.password() == null && patch.enabled() == null)
            throw new BusinessException(ErrorCode.BAD_REQUEST, "未提供修改字段");
        if (patch.name() != null) requireName(patch.name());
        if (patch.phone() != null) requirePhone(patch.phone());
        if (patch.password() != null) requirePassword(patch.password());
        boolean enabled = patch.enabled() == null ? current.enabled() : patch.enabled();
        String name = patch.name() == null ? current.name() : patch.name().trim();
        String phone = patch.phone() == null ? current.phone() : patch.phone().trim();
        if (patch.password() == null) {
            jdbc.update("update auth_account set display_name=?,driver_phone=?,enabled=?,updated_at=current_timestamp,version=version+1 where id=? and driver_supplier_id=? and actor_type='driver' and deleted=false",
                    name, phone, enabled, id, supplierId);
        } else {
            jdbc.update("update auth_account set display_name=?,driver_phone=?,enabled=?,password_hash=?,updated_at=current_timestamp,version=version+1 where id=? and driver_supplier_id=? and actor_type='driver' and deleted=false",
                    name, phone, enabled, encoder.encode(patch.password()), id, supplierId);
        }
        if (patch.password() != null || Boolean.FALSE.equals(patch.enabled())) {
            jdbc.update("update auth_session set revoked_at=current_timestamp,revoked_reason='ACCOUNT_UPDATED',updated_at=current_timestamp,version=version+1 where actor_type='driver' and actor_id=? and revoked_at is null", id);
        }
        return ApiResponse.ok(find(id, supplierId));
    }

    private String supplierId(String authorization) {
        if (authorization == null || !authorization.startsWith("Bearer ")) throw new BusinessException(ErrorCode.UNAUTHORIZED);
        TokenClaims claims = authService.verifyAccessToken(authorization.substring(7));
        if (!"supplier".equals(claims.actorType()) || !"PLATFORM".equals(claims.tenantId())
                || claims.supplierId() == null) throw new BusinessException(ErrorCode.FORBIDDEN);
        return claims.supplierId();
    }

    private DriverView find(String id, String supplierId) {
        List<DriverView> rows = jdbc.query("""
                select id,driver_supplier_id,display_name,driver_phone,account,enabled from auth_account
                where id=? and driver_supplier_id=? and actor_type='driver' and deleted=false
                """, (rs, row) -> view(rs.getString("id"), rs.getString("driver_supplier_id"),
                rs.getString("display_name"), rs.getString("driver_phone"), rs.getString("account"), rs.getBoolean("enabled")), id, supplierId);
        if (rows.isEmpty()) throw new BusinessException(ErrorCode.NOT_FOUND, "司机账号不存在");
        return rows.getFirst();
    }

    private DriverView view(String id, String supplierId, String name, String phone, String account, boolean enabled) {
        return new DriverView(id, supplierId, name, phone, account, enabled);
    }
    private void requireName(String value) {
        if (value == null || value.isBlank() || value.trim().length() > 20) throw new BusinessException(ErrorCode.BAD_REQUEST, "姓名必填且不超过20字");
    }
    private void requirePhone(String value) {
        if (value == null || !value.trim().matches("1[3-9]\\d{9}")) throw new BusinessException(ErrorCode.BAD_REQUEST, "手机号格式不正确");
    }
    private void requireAccount(String value) {
        if (value == null || !value.trim().matches("[a-zA-Z0-9]{4,20}")) throw new BusinessException(ErrorCode.BAD_REQUEST, "账号需4-20位字母或数字");
    }
    private void requirePassword(String value) {
        if (value == null || value.length() < 6 || value.length() > 20) throw new BusinessException(ErrorCode.BAD_REQUEST, "密码需6-20位");
    }
}

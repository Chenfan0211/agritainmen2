package com.agritainmen.auth.web;

import com.agritainmen.common.core.ApiResponse;
import com.agritainmen.common.core.BusinessException;
import com.agritainmen.common.core.ErrorCode;
import com.agritainmen.common.core.Ids;
import com.agritainmen.auth.service.SupplierApprovalVerifier;
import com.agritainmen.common.security.TokenClaims;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.List;

@RestController
@RequestMapping("/api/v1/auth/admin/supplier-accounts")
public class SupplierAccountAdminController {
    private static final SecureRandom RANDOM = new SecureRandom();
    private final JdbcTemplate jdbc;
    private final PasswordEncoder encoder;
    private final SupplierApprovalVerifier supplierApprovalVerifier;

    public SupplierAccountAdminController(JdbcTemplate jdbc, PasswordEncoder encoder,
                                          SupplierApprovalVerifier supplierApprovalVerifier) {
        this.jdbc = jdbc;
        this.encoder = encoder;
        this.supplierApprovalVerifier = supplierApprovalVerifier;
    }

    public record ProvisionRequest(@NotBlank String supplierId, @NotBlank String account,
                                   @NotBlank String displayName, String password) {}
    public record AccountPatch(String displayName, String password, Boolean enabled, String freezeReason) {}
    public record AccountView(String id, String supplierId, String account, String displayName, boolean enabled, String freezeReason) {}
    public record ProvisionResult(String id, String supplierId, String account, String displayName,
                                  boolean enabled, String initialPassword) {}

    @PostMapping
    @Transactional
    public ApiResponse<ProvisionResult> provision(@Valid @RequestBody ProvisionRequest request,
                                                 @RequestHeader("Authorization") String authorization) {
        AccountView current = findOptional(request.supplierId());
        if (current != null) return ApiResponse.ok(result(current, null));
        supplierApprovalVerifier.requireApproved(request.supplierId(), authorization);
        if (request.password() != null && request.password().isBlank()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "密码不能为空");
        }
        String generated = request.password() == null ? randomPassword() : null;
        String password = generated == null ? request.password() : generated;
        try {
            jdbc.update("""
                    insert into auth_account(id,tenant_id,actor_type,supplier_id,account,password_hash,display_name,enabled,created_at,updated_at,version,deleted)
                    values (?,'PLATFORM','supplier',?,?,?,?,true,current_timestamp,current_timestamp,0,false)
                    """, Ids.uuid("ACCOUNT"), request.supplierId(), request.account().trim(), encoder.encode(password), request.displayName().trim());
        } catch (DuplicateKeyException duplicate) {
            AccountView raced = findOptional(request.supplierId());
            if (raced != null) return ApiResponse.ok(result(raced, null));
            throw new BusinessException(ErrorCode.CONFLICT, "供应商登录账号已存在");
        }
        return ApiResponse.ok(result(find(request.supplierId()), generated));
    }

    @GetMapping
    public ApiResponse<List<AccountView>> list() {
        return ApiResponse.ok(jdbc.query("""
                select id,supplier_id,account,display_name,enabled,freeze_reason from auth_account
                where tenant_id='PLATFORM' and actor_type='supplier' and supplier_id is not null and deleted=false
                order by account
                """, (rs, row) -> view(rs.getString("id"), rs.getString("supplier_id"), rs.getString("account"),
                rs.getString("display_name"), rs.getBoolean("enabled"), rs.getString("freeze_reason"))));
    }

    @GetMapping("/{supplierId}")
    public ApiResponse<AccountView> get(@PathVariable String supplierId) {
        return ApiResponse.ok(find(supplierId));
    }

    @PatchMapping("/{supplierId}")
    @Transactional
    public ApiResponse<AccountView> update(@PathVariable String supplierId, @RequestBody AccountPatch patch,
                                           @AuthenticationPrincipal TokenClaims claims) {
        boolean accountUpdate = patch.displayName() != null || patch.password() != null;
        boolean freeze = patch.enabled() != null || patch.freezeReason() != null;
        if (!accountUpdate && !freeze) throw new BusinessException(ErrorCode.BAD_REQUEST, "未提供修改字段");
        List<String> permissions = claims.permissions() == null ? List.of() : claims.permissions();
        if (!permissions.contains("*") && ((accountUpdate && !permissions.contains("supplier.account.update"))
                || (freeze && !permissions.contains("supplier.account.freeze")))) {
            throw new BusinessException(ErrorCode.FORBIDDEN);
        }
        AccountView current = find(supplierId);
        if (patch.displayName() != null && patch.displayName().isBlank()) throw new BusinessException(ErrorCode.BAD_REQUEST, "名称不能为空");
        if (patch.password() != null && patch.password().isBlank()) throw new BusinessException(ErrorCode.BAD_REQUEST, "密码不能为空");
        if (Boolean.FALSE.equals(patch.enabled()) && (patch.freezeReason() == null || patch.freezeReason().isBlank()))
            throw new BusinessException(ErrorCode.BAD_REQUEST, "请填写冻结原因");
        if (patch.freezeReason() != null && patch.enabled() == null && current.enabled())
            throw new BusinessException(ErrorCode.BAD_REQUEST, "启用中的账号不能设置冻结原因");
        if (patch.freezeReason() != null && !Boolean.TRUE.equals(patch.enabled()) && patch.freezeReason().isBlank())
            throw new BusinessException(ErrorCode.BAD_REQUEST, "请填写冻结原因");
        if (patch.freezeReason() != null && patch.freezeReason().length() > 500)
            throw new BusinessException(ErrorCode.BAD_REQUEST, "冻结原因不能超过500字");
        String displayName = patch.displayName() == null ? current.displayName() : patch.displayName().trim();
        boolean enabled = patch.enabled() == null ? current.enabled() : patch.enabled();
        String freezeReason = enabled ? null : patch.freezeReason() == null ? current.freezeReason() : patch.freezeReason().trim();
        if (patch.password() == null) {
            jdbc.update("update auth_account set display_name=?,enabled=?,freeze_reason=?,updated_at=current_timestamp,version=version+1 where id=?",
                    displayName, enabled, freezeReason, current.id());
        } else {
            jdbc.update("update auth_account set display_name=?,enabled=?,freeze_reason=?,password_hash=?,updated_at=current_timestamp,version=version+1 where id=?",
                    displayName, enabled, freezeReason, encoder.encode(patch.password()), current.id());
        }
        if (!enabled || patch.password() != null) {
            jdbc.update("""
                    update auth_session set revoked_at=current_timestamp,revoked_reason='ACCOUNT_UPDATED',updated_at=current_timestamp,version=version+1
                    where actor_type='supplier' and actor_id=? and revoked_at is null
                    """, current.id());
        }
        if (!enabled) {
            jdbc.update("""
                    update auth_session set revoked_at=current_timestamp,revoked_reason='SUPPLIER_FROZEN',updated_at=current_timestamp,version=version+1
                    where actor_type='driver' and actor_id in
                      (select id from auth_account where actor_type='driver' and driver_supplier_id=? and deleted=false)
                      and revoked_at is null
                    """, supplierId);
        }
        return ApiResponse.ok(find(supplierId));
    }

    private AccountView find(String supplierId) {
        AccountView account = findOptional(supplierId);
        if (account == null) throw new BusinessException(ErrorCode.NOT_FOUND, "供应商账号不存在");
        return account;
    }

    private AccountView findOptional(String supplierId) {
        List<AccountView> accounts = jdbc.query("""
                select id,supplier_id,account,display_name,enabled,freeze_reason from auth_account
                where tenant_id='PLATFORM' and actor_type='supplier' and supplier_id=? and deleted=false
                """, (rs, row) -> view(rs.getString("id"), rs.getString("supplier_id"), rs.getString("account"),
                rs.getString("display_name"), rs.getBoolean("enabled"), rs.getString("freeze_reason")), supplierId);
        return accounts.isEmpty() ? null : accounts.getFirst();
    }

    private AccountView view(String id, String supplierId, String account, String displayName, boolean enabled, String freezeReason) {
        return new AccountView(id, supplierId, account, displayName, enabled, freezeReason);
    }

    private ProvisionResult result(AccountView account, String initialPassword) {
        return new ProvisionResult(account.id(), account.supplierId(), account.account(), account.displayName(), account.enabled(), initialPassword);
    }

    private String randomPassword() {
        byte[] bytes = new byte[18];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}

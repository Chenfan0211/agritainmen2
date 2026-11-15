package com.agritainmen.auth.web;

import com.agritainmen.auth.service.StoreAccountBindingClient;
import com.agritainmen.common.core.ApiResponse;
import com.agritainmen.common.core.BusinessException;
import com.agritainmen.common.core.ErrorCode;
import com.agritainmen.common.core.Ids;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/auth/admin/store-accounts")
public class StoreAccountAdminController {
    private final JdbcTemplate jdbc;
    private final PasswordEncoder encoder;
    private final StoreAccountBindingClient bindingClient;

    public StoreAccountAdminController(JdbcTemplate jdbc, PasswordEncoder encoder,
                                       StoreAccountBindingClient bindingClient) {
        this.jdbc = jdbc;
        this.encoder = encoder;
        this.bindingClient = bindingClient;
    }

    public record ProvisionRequest(@NotBlank String storeAccountId, @NotBlank String password) {}
    public record AccountView(String id, String storeAccountId, String farmId, String account, boolean enabled) {}

    @GetMapping
    public ApiResponse<List<AccountView>> list() {
        return ApiResponse.ok(jdbc.query("""
                select id,store_account_id,farm_id,account,enabled from auth_account
                where tenant_id='PLATFORM' and actor_type='store' and store_account_id is not null and deleted=false
                order by account
                """, (rs, row) -> new AccountView(rs.getString("id"), rs.getString("store_account_id"),
                rs.getString("farm_id"), rs.getString("account"), rs.getBoolean("enabled"))));
    }

    @PostMapping
    @Transactional
    public ApiResponse<AccountView> provision(@Valid @RequestBody ProvisionRequest request,
                                              @RequestHeader("Authorization") String authorization) {
        StoreAccountBindingClient.Binding binding = bindingClient.load(request.storeAccountId().trim(), authorization);
        if (!binding.enabled()) throw new BusinessException(ErrorCode.CONFLICT, "门店账号已停用");
        AccountView current = find(binding.id());
        if (current != null) {
            if (!current.farmId().equals(binding.farmId()) || !current.account().equals(binding.account()))
                throw new BusinessException(ErrorCode.CONFLICT, "门店账号绑定已变化");
            return ApiResponse.ok(current);
        }
        try {
            jdbc.update("""
                    insert into auth_account(id,tenant_id,actor_type,store_account_id,farm_id,account,password_hash,
                                             display_name,enabled,created_at,updated_at,version,deleted)
                    values (?,'PLATFORM','store',?,?,?,?,?,true,current_timestamp,current_timestamp,0,false)
                    """, Ids.uuid("ACCOUNT"), binding.id(), binding.farmId(), binding.account(),
                    encoder.encode(request.password()), binding.account());
        } catch (DuplicateKeyException duplicate) {
            AccountView raced = find(binding.id());
            if (raced != null) return ApiResponse.ok(raced);
            throw new BusinessException(ErrorCode.CONFLICT, "门店登录账号已存在");
        }
        return ApiResponse.ok(find(binding.id()));
    }

    private AccountView find(String storeAccountId) {
        List<AccountView> accounts = jdbc.query("""
                select id,store_account_id,farm_id,account,enabled from auth_account
                where actor_type='store' and store_account_id=? and deleted=false
                """, (rs, row) -> new AccountView(rs.getString("id"), rs.getString("store_account_id"),
                rs.getString("farm_id"), rs.getString("account"), rs.getBoolean("enabled")), storeAccountId);
        return accounts.isEmpty() ? null : accounts.getFirst();
    }
}

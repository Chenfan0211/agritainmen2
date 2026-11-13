package com.agritainmen.auth.service;

import com.agritainmen.auth.persistence.AuthAccount;
import com.agritainmen.auth.persistence.AuthAccountMapper;
import com.agritainmen.auth.persistence.AuthAccountRole;
import com.agritainmen.auth.persistence.AuthAccountRoleMapper;
import com.agritainmen.auth.persistence.AuthIdentity;
import com.agritainmen.auth.persistence.AuthIdentityMapper;
import com.agritainmen.auth.persistence.AuthRole;
import com.agritainmen.auth.persistence.AuthRoleMapper;
import com.agritainmen.common.core.Ids;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class DemoAuthSeeder implements ApplicationRunner {
    private final AuthAccountMapper accountMapper;
    private final AuthRoleMapper roleMapper;
    private final AuthAccountRoleMapper accountRoleMapper;
    private final AuthIdentityMapper identityMapper;
    private final PasswordEncoder passwordEncoder;
    private final boolean enabled;

    public DemoAuthSeeder(AuthAccountMapper accountMapper, AuthRoleMapper roleMapper,
                          AuthAccountRoleMapper accountRoleMapper, AuthIdentityMapper identityMapper,
                          PasswordEncoder passwordEncoder,
                          @Value("${agritainmen.demo.seed-enabled:false}") boolean enabled) {
        this.accountMapper = accountMapper;
        this.roleMapper = roleMapper;
        this.accountRoleMapper = accountRoleMapper;
        this.identityMapper = identityMapper;
        this.passwordEncoder = passwordEncoder;
        this.enabled = enabled;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (!enabled) return;
        AuthRole role = seedRole("super_admin", "超级管理员", "[\"*\"]");
        seedAccount("admin", "admin", "超级管理员", "123456", role.getId(), null);
        seedAccount("store", "13800000000", "门店演示账号", "123456", role.getId(), null);
        seedAccount("supplier", "13787366688", "湘西腊味合作社", "13787366688", role.getId(), "S-DEMO-001");
        seedAccount("driver", "driver01", "演示司机", "123456", role.getId(), null);
        AuthAccount demoDriver = accountMapper.selectOne(new LambdaQueryWrapper<AuthAccount>()
                .eq(AuthAccount::getActorType, "driver").eq(AuthAccount::getAccount, "driver01").last("limit 1"));
        if (demoDriver != null && demoDriver.getDriverSupplierId() == null) {
            demoDriver.setDriverSupplierId("S-DEMO-001");
            demoDriver.setDriverPhone("13900000001");
            accountMapper.updateById(demoDriver);
        }
        seedIdentity("IDENTITY-DEMO-NORMAL", "mock_openid_demo_normal", "U-DEMO-NORMAL", "王小满", "normal", null, null, "active");
        seedIdentity("IDENTITY-DEMO-L1", "mock_openid_demo_level1", "U-DEMO-L1", "李湘云", "level1", "T001", null, "active");
        seedIdentity("IDENTITY-DEMO-L2", "mock_openid_demo_level2", "U-DEMO-L2", "周巧云", "level2", "T002", "T001", "active");
        seedIdentity("IDENTITY-DEMO-PAUSED", "mock_openid_demo_leader_paused", "U-DEMO-PAUSED", "停用团长", "level1", "T001", null, "disabled");
    }

    private AuthRole seedRole(String code, String name, String permissionsJson) {
        AuthRole role = roleMapper.selectOne(new LambdaQueryWrapper<AuthRole>().eq(AuthRole::getCode, code).last("limit 1"));
        if (role != null) return role;
        role = new AuthRole();
        role.setId(Ids.uuid("ROLE"));
        role.setCode(code);
        role.setName(name);
        role.setPermissionsJson(permissionsJson);
        role.setSystemRole(true);
        role.setEnabled(true);
        roleMapper.insert(role);
        return role;
    }

    private void seedAccount(String actorType, String account, String displayName, String rawPassword, String roleId, String supplierId) {
        AuthAccount found = accountMapper.selectOne(new LambdaQueryWrapper<AuthAccount>()
                .eq(AuthAccount::getActorType, actorType).eq(AuthAccount::getAccount, account).last("limit 1"));
        if (found != null) return;
        found = new AuthAccount();
        found.setId(Ids.uuid("ACCOUNT"));
        found.setActorType(actorType);
        found.setSupplierId(supplierId);
        found.setAccount(account);
        found.setDisplayName(displayName);
        found.setPasswordHash(passwordEncoder.encode(rawPassword));
        found.setEnabled(true);
        accountMapper.insert(found);
        AuthAccountRole relation = new AuthAccountRole();
        relation.setId(Ids.uuid("ACCOUNT_ROLE"));
        relation.setAccountId(found.getId());
        relation.setRoleId(roleId);
        accountRoleMapper.insert(relation);
    }

    private void seedIdentity(String id, String openid, String userId, String nickname, String level,
                              String leaderId, String parentLeaderId, String status) {
        AuthIdentity found = identityMapper.selectOne(new LambdaQueryWrapper<AuthIdentity>()
                .eq(AuthIdentity::getOpenid, openid).last("limit 1"));
        if (found != null) return;
        AuthIdentity identity = new AuthIdentity();
        identity.setId(id);
        identity.setOpenid(openid);
        identity.setUserId(userId);
        identity.setNickname(nickname);
        identity.setLevel(level);
        identity.setLeaderId(leaderId);
        identity.setParentLeaderId(parentLeaderId);
        identity.setStatus(status);
        identityMapper.insert(identity);
    }
}

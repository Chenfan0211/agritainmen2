package com.agritainmen.auth.persistence;

import com.agritainmen.common.data.BaseEntity;
import com.baomidou.mybatisplus.annotation.TableName;

@TableName("auth_account_role")
public class AuthAccountRole extends BaseEntity {
    private String accountId;
    private String roleId;
    public String getAccountId() { return accountId; }
    public void setAccountId(String accountId) { this.accountId = accountId; }
    public String getRoleId() { return roleId; }
    public void setRoleId(String roleId) { this.roleId = roleId; }
}

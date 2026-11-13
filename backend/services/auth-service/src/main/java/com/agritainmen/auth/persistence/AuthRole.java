package com.agritainmen.auth.persistence;

import com.agritainmen.common.data.BaseEntity;
import com.baomidou.mybatisplus.annotation.TableName;

@TableName("auth_role")
public class AuthRole extends BaseEntity {
    private String code;
    private String name;
    private String permissionsJson;
    private Boolean systemRole;
    private Boolean enabled;
    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getPermissionsJson() { return permissionsJson; }
    public void setPermissionsJson(String permissionsJson) { this.permissionsJson = permissionsJson; }
    public Boolean getSystemRole() { return systemRole; }
    public void setSystemRole(Boolean systemRole) { this.systemRole = systemRole; }
    public Boolean getEnabled() { return enabled; }
    public void setEnabled(Boolean enabled) { this.enabled = enabled; }
}

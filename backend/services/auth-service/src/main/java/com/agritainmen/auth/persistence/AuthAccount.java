package com.agritainmen.auth.persistence;

import com.agritainmen.common.data.BaseEntity;
import com.baomidou.mybatisplus.annotation.TableName;

@TableName("auth_account")
public class AuthAccount extends BaseEntity {
    private String actorType;
    private String supplierId;
    private String storeAccountId;
    private String farmId;
    private String driverSupplierId;
    private String driverPhone;
    private String account;
    private String passwordHash;
    private String displayName;
    private Boolean enabled;
    public String getActorType() { return actorType; }
    public void setActorType(String actorType) { this.actorType = actorType; }
    public String getSupplierId() { return supplierId; }
    public void setSupplierId(String supplierId) { this.supplierId = supplierId; }
    public String getStoreAccountId() { return storeAccountId; }
    public void setStoreAccountId(String storeAccountId) { this.storeAccountId = storeAccountId; }
    public String getFarmId() { return farmId; }
    public void setFarmId(String farmId) { this.farmId = farmId; }
    public String getDriverSupplierId() { return driverSupplierId; }
    public void setDriverSupplierId(String driverSupplierId) { this.driverSupplierId = driverSupplierId; }
    public String getDriverPhone() { return driverPhone; }
    public void setDriverPhone(String driverPhone) { this.driverPhone = driverPhone; }
    public String getAccount() { return account; }
    public void setAccount(String account) { this.account = account; }
    public String getPasswordHash() { return passwordHash; }
    public void setPasswordHash(String passwordHash) { this.passwordHash = passwordHash; }
    public String getDisplayName() { return displayName; }
    public void setDisplayName(String displayName) { this.displayName = displayName; }
    public Boolean getEnabled() { return enabled; }
    public void setEnabled(Boolean enabled) { this.enabled = enabled; }
}

package com.agritainmen.auth.persistence;

import com.agritainmen.common.data.BaseEntity;
import com.baomidou.mybatisplus.annotation.TableName;

@TableName("auth_identity")
public class AuthIdentity extends BaseEntity {
    private String openid;
    private String userId;
    private String nickname;
    private String avatarUrl;
    private String level;
    private String leaderId;
    private String parentLeaderId;
    private String status;
    public String getOpenid() { return openid; }
    public void setOpenid(String openid) { this.openid = openid; }
    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getNickname() { return nickname; }
    public void setNickname(String nickname) { this.nickname = nickname; }
    public String getAvatarUrl() { return avatarUrl; }
    public void setAvatarUrl(String avatarUrl) { this.avatarUrl = avatarUrl; }
    public String getLevel() { return level; }
    public void setLevel(String level) { this.level = level; }
    public String getLeaderId() { return leaderId; }
    public void setLeaderId(String leaderId) { this.leaderId = leaderId; }
    public String getParentLeaderId() { return parentLeaderId; }
    public void setParentLeaderId(String parentLeaderId) { this.parentLeaderId = parentLeaderId; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
}

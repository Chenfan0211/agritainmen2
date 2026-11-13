package com.agritainmen.auth.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.LinkedHashMap;
import java.util.Map;

@ConfigurationProperties(prefix = "agritainmen.wechat")
public class WechatProperties {
    private String mode = "demo";
    private Map<String, AppCredential> apps = new LinkedHashMap<>();

    public String getMode() { return mode; }
    public void setMode(String mode) { this.mode = mode; }
    public Map<String, AppCredential> getApps() { return apps; }
    public void setApps(Map<String, AppCredential> apps) { this.apps = apps; }

    public static class AppCredential {
        private String appId = "";
        private String appSecret = "";
        public String getAppId() { return appId; }
        public void setAppId(String appId) { this.appId = appId; }
        public String getAppSecret() { return appSecret; }
        public void setAppSecret(String appSecret) { this.appSecret = appSecret; }
    }
}

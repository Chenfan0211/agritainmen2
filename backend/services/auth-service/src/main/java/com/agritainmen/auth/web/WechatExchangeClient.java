package com.agritainmen.auth.web;

import com.agritainmen.auth.config.WechatProperties;
import com.agritainmen.common.core.BusinessException;
import com.agritainmen.common.core.ErrorCode;
import com.fasterxml.jackson.annotation.JsonProperty;
import org.springframework.web.client.RestClient;

import java.util.Locale;

public class WechatExchangeClient {
    private final WechatProperties properties;
    private final RestClient restClient = RestClient.builder().baseUrl("https://api.weixin.qq.com").build();

    public WechatExchangeClient(WechatProperties properties) {
        this.properties = properties;
    }

    public String exchange(String app, String code) {
        String normalizedApp = app == null || app.isBlank() ? "user" : app.trim().toLowerCase(Locale.ROOT);
        if (code == null || code.isBlank()) throw new BusinessException(ErrorCode.BAD_REQUEST, "微信登录 code 不能为空");
        if ("demo".equalsIgnoreCase(properties.getMode())) {
            String value = code.trim().replaceAll("[^a-zA-Z0-9_]", "_");
            return value.startsWith("mock_openid_") ? value : "mock_openid_" + normalizedApp + "_" + value;
        }
        WechatProperties.AppCredential credential = properties.getApps().get(normalizedApp);
        if (credential == null || credential.getAppId().isBlank() || credential.getAppSecret().isBlank()) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, normalizedApp + " 微信登录配置不完整");
        }
        WechatSession response = restClient.get()
                .uri(uriBuilder -> uriBuilder.path("/sns/jscode2session")
                        .queryParam("appid", credential.getAppId())
                        .queryParam("secret", credential.getAppSecret())
                        .queryParam("js_code", code)
                        .queryParam("grant_type", "authorization_code")
                        .build())
                .retrieve()
                .body(WechatSession.class);
        if (response == null || response.openid() == null || response.openid().isBlank()) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, response == null ? "微信登录失败" : response.errmsg());
        }
        return response.openid();
    }

    private record WechatSession(String openid, @JsonProperty("session_key") String sessionKey,
                                 @JsonProperty("errcode") Integer errorCode, @JsonProperty("errmsg") String errmsg) {
    }
}

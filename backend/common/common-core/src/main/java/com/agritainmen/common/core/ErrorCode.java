package com.agritainmen.common.core;

public enum ErrorCode {
    BAD_REQUEST("BAD_REQUEST", "请求参数错误"),
    UNAUTHORIZED("UNAUTHORIZED", "未登录或登录已失效"),
    FORBIDDEN("FORBIDDEN", "无权限执行该操作"),
    NOT_FOUND("NOT_FOUND", "资源不存在"),
    CONFLICT("CONFLICT", "数据状态已变化，请刷新后重试"),
    IDEMPOTENCY_CONFLICT("IDEMPOTENCY_CONFLICT", "幂等键已被不同请求使用"),
    OUT_OF_STOCK("OUT_OF_STOCK", "库存不足"),
    RATE_LIMITED("RATE_LIMITED", "请求过于频繁"),
    INTERNAL_ERROR("INTERNAL_ERROR", "服务内部错误");

    private final String code;
    private final String defaultMessage;

    ErrorCode(String code, String defaultMessage) {
        this.code = code;
        this.defaultMessage = defaultMessage;
    }

    public String code() {
        return code;
    }

    public String defaultMessage() {
        return defaultMessage;
    }
}

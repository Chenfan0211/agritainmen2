package com.agritainmen.common.core;

import java.time.Instant;

public record ApiResponse<T>(
        String code,
        String message,
        T data,
        String traceId,
        Instant timestamp
) {
    public static <T> ApiResponse<T> ok(T data) {
        return new ApiResponse<>("OK", "success", data, TraceContext.traceId(), Instant.now());
    }

    public static <T> ApiResponse<T> ok() {
        return ok(null);
    }

    public static ApiResponse<Void> fail(String code, String message) {
        return new ApiResponse<>(code, message, null, TraceContext.traceId(), Instant.now());
    }
}

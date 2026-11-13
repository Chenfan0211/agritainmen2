package com.agritainmen.common.core;

import java.util.UUID;

public final class TraceContext {
    private static final ThreadLocal<String> TRACE_ID = new ThreadLocal<>();

    private TraceContext() {
    }

    public static String traceId() {
        String current = TRACE_ID.get();
        if (current == null || current.isBlank()) {
            return "";
        }
        return current;
    }

    public static void set(String traceId) {
        TRACE_ID.set(traceId == null || traceId.isBlank() ? newTraceId() : traceId);
    }

    public static void clear() {
        TRACE_ID.remove();
    }

    public static String newTraceId() {
        return UUID.randomUUID().toString().replace("-", "");
    }
}

package com.agritainmen.common.core;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

public final class Ids {
    private static final DateTimeFormatter FORMATTER = DateTimeFormatter.ofPattern("yyyyMMddHHmmss").withZone(ZoneOffset.UTC);

    private Ids() {
    }

    public static String uuid(String prefix) {
        String normalized = prefix == null ? "" : prefix.trim().toUpperCase();
        String value = UUID.randomUUID().toString().replace("-", "").substring(0, 20).toUpperCase();
        return normalized.isBlank() ? value : normalized + "-" + value;
    }

    public static String business(String prefix) {
        String normalized = prefix == null ? "ID" : prefix.trim().toUpperCase();
        int suffix = ThreadLocalRandom.current().nextInt(1000, 9999);
        return normalized + FORMATTER.format(Instant.now()) + suffix;
    }
}

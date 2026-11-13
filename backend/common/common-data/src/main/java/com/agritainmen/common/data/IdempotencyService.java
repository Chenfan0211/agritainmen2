package com.agritainmen.common.data;

import com.agritainmen.common.core.BusinessException;
import com.agritainmen.common.core.ErrorCode;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.function.Supplier;

public class IdempotencyService {
    private final IdempotencyMapper mapper;

    public IdempotencyService(IdempotencyMapper mapper) {
        this.mapper = mapper;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public <T> T execute(String scene, String key, String requestBody, Supplier<T> action) {
        if (key == null || key.isBlank()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Idempotency-Key 不能为空");
        }
        String hash = sha256(requestBody == null ? "" : requestBody);
        IdempotencyRecord existing = find(scene, key);
        if (existing != null) {
            if (!hash.equals(existing.getRequestHash())) {
                throw new BusinessException(ErrorCode.IDEMPOTENCY_CONFLICT);
            }
            throw new BusinessException(ErrorCode.CONFLICT, "该请求已处理，请勿重复提交");
        }

        IdempotencyRecord record = new IdempotencyRecord();
        record.setId(com.agritainmen.common.core.Ids.uuid("IDEM"));
        record.setScene(scene);
        record.setIdempotencyKey(key);
        record.setRequestHash(hash);
        record.setStatus("PROCESSING");
        record.setExpiresAt(Instant.now().plus(Duration.ofHours(24)));
        try {
            mapper.insert(record);
        } catch (DuplicateKeyException duplicate) {
            throw new BusinessException(ErrorCode.CONFLICT, "该请求正在处理，请稍后重试");
        }
        T value = action.get();
        record.setStatus("SUCCEEDED");
        mapper.updateById(record);
        return value;
    }

    public IdempotencyRecord find(String scene, String key) {
        return mapper.selectOne(new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<IdempotencyRecord>()
                .eq(IdempotencyRecord::getScene, scene)
                .eq(IdempotencyRecord::getIdempotencyKey, key)
                .last("limit 1"));
    }

    private String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }
}

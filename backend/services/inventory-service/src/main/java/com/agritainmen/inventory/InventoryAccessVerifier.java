package com.agritainmen.inventory;

import com.agritainmen.common.core.BusinessException;
import com.agritainmen.common.core.ErrorCode;
import com.agritainmen.common.web.RemoteAdminVerifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@Component
public class InventoryAccessVerifier {
    private final RemoteAdminVerifier admin;
    private final String internalToken;

    public InventoryAccessVerifier(RemoteAdminVerifier admin,
            @Value("${agritainmen.security.inventory.internal-token:}") String internalToken) {
        this.admin = admin;
        this.internalToken = internalToken;
    }

    public void requireInternal(String supplied) {
        if (internalToken == null || internalToken.isBlank())
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "库存内部令牌未配置");
        if (supplied == null || !MessageDigest.isEqual(internalToken.getBytes(StandardCharsets.UTF_8),
                supplied.getBytes(StandardCharsets.UTF_8)))
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
    }

    public void requireAdmin(String authorization) {
        admin.requireAdmin(authorization);
    }
}

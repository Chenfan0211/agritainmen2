package com.agritainmen.org.web;

import com.agritainmen.common.core.ApiResponse;
import com.agritainmen.common.core.BusinessException;
import com.agritainmen.common.core.ErrorCode;
import com.agritainmen.common.core.Ids;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

@RestController
@RequestMapping("/api/v1/org/media")
public class OrgMediaController {
    private static final int MAX_BYTES = 2 * 1024 * 1024;
    private static final Set<String> PURPOSES = Set.of("supplier-business-license", "supplier-permit", "farm-cover");
    private final JdbcTemplate jdbc;

    public OrgMediaController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public record UploadRequest(String mimeType, String purpose, String base64) {}

    @PostMapping
    @Transactional
    public ApiResponse<Map<String, Object>> upload(@RequestBody UploadRequest request) {
        if (request == null || !PURPOSES.contains(request.purpose()) || request.base64() == null
                || request.base64().length() > ((MAX_BYTES + 2) / 3) * 4 || request.base64().isBlank())
            throw new BusinessException(ErrorCode.BAD_REQUEST, "图片内容或用途无效");
        byte[] content;
        try { content = Base64.getDecoder().decode(request.base64()); }
        catch (IllegalArgumentException error) { throw new BusinessException(ErrorCode.BAD_REQUEST, "图片编码无效"); }
        if (content.length == 0 || content.length > MAX_BYTES || !matchesMime(request.mimeType(), content))
            throw new BusinessException(ErrorCode.BAD_REQUEST, "仅支持2MB以内的 JPEG、PNG、WebP 图片");
        String id = Ids.uuid("ORG-MEDIA");
        jdbc.update("insert into org_media(id,tenant_id,purpose,mime_type,content,size_bytes,created_at) values (?, 'PLATFORM', ?, ?, ?, ?, current_timestamp)",
                id, request.purpose(), request.mimeType(), content, content.length);
        return ApiResponse.ok(Map.of("assetId", id));
    }

    @GetMapping("/{id}")
    public ResponseEntity<byte[]> read(@PathVariable String id) {
        List<Map<String, Object>> rows = jdbc.queryForList("select mime_type, content from org_media where id=? and tenant_id='PLATFORM'", id);
        if (rows.isEmpty()) throw new BusinessException(ErrorCode.NOT_FOUND, "图片不存在");
        Map<String, Object> row = rows.getFirst();
        return ResponseEntity.ok().contentType(MediaType.parseMediaType((String) row.get("mime_type")))
                .cacheControl(CacheControl.maxAge(1, TimeUnit.HOURS).cachePrivate())
                .body((byte[]) row.get("content"));
    }

    private boolean matchesMime(String mime, byte[] bytes) {
        if ("image/png".equals(mime)) return bytes.length >= 8 && bytes[0] == (byte) 0x89 && bytes[1] == 0x50
                && bytes[2] == 0x4e && bytes[3] == 0x47 && bytes[4] == 0x0d && bytes[5] == 0x0a && bytes[6] == 0x1a && bytes[7] == 0x0a;
        if ("image/jpeg".equals(mime)) return bytes.length >= 3 && bytes[0] == (byte) 0xff && bytes[1] == (byte) 0xd8 && bytes[2] == (byte) 0xff;
        if ("image/webp".equals(mime)) return bytes.length >= 12 && bytes[0] == 'R' && bytes[1] == 'I' && bytes[2] == 'F'
                && bytes[3] == 'F' && bytes[8] == 'W' && bytes[9] == 'E' && bytes[10] == 'B' && bytes[11] == 'P';
        return false;
    }
}

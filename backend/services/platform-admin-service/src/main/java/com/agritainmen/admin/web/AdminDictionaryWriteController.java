package com.agritainmen.admin.web;

import com.agritainmen.common.core.ApiResponse;
import com.agritainmen.common.core.BusinessException;
import com.agritainmen.common.core.ErrorCode;
import com.agritainmen.common.core.Ids;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/admin")
public class AdminDictionaryWriteController {
    private final JdbcTemplate jdbc;
    public AdminDictionaryWriteController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public record DictionaryRequest(@NotBlank String groupCode, @NotBlank String itemCode, @NotBlank String label, Integer sortOrder, Boolean enabled) {}

    @PostMapping("/dictionaries")
    public ApiResponse<Map<String, Object>> create(@Valid @RequestBody DictionaryRequest request) {
        String id = Ids.uuid("DICT");
        jdbc.update("insert into admin_dictionary(id,tenant_id,group_code,item_code,label,sort_order,enabled,created_at,updated_at,version,deleted) values (?, 'PLATFORM', ?, ?, ?, ?, ?, current_timestamp, current_timestamp, 0, false)",
                id, request.groupCode(), request.itemCode(), request.label(), request.sortOrder() == null ? 0 : request.sortOrder(), request.enabled() == null || request.enabled());
        return ApiResponse.ok(find(request.groupCode(), request.itemCode()));
    }

    @PutMapping("/dictionaries")
    public ApiResponse<Map<String, Object>> update(@Valid @RequestBody DictionaryRequest request) {
        int updated = jdbc.update("update admin_dictionary set label=?, sort_order=?, enabled=?, updated_at=current_timestamp, version=version+1 where group_code=? and item_code=? and deleted=false",
                request.label(), request.sortOrder() == null ? 0 : request.sortOrder(), request.enabled() == null || request.enabled(), request.groupCode(), request.itemCode());
        if (updated != 1) throw new BusinessException(ErrorCode.NOT_FOUND, "字典项不存在");
        return ApiResponse.ok(find(request.groupCode(), request.itemCode()));
    }

    @DeleteMapping("/dictionaries")
    public ApiResponse<Boolean> delete(@RequestParam String groupCode, @RequestParam String itemCode) {
        jdbc.update("update admin_dictionary set deleted=true, updated_at=current_timestamp, version=version+1 where group_code=? and item_code=?", groupCode, itemCode);
        return ApiResponse.ok(true);
    }

    private Map<String, Object> find(String groupCode, String itemCode) {
        return jdbc.queryForMap("select id, group_code, item_code, label, sort_order, enabled from admin_dictionary where group_code=? and item_code=? and deleted=false", groupCode, itemCode);
    }
}

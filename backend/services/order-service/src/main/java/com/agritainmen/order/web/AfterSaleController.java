package com.agritainmen.order.web;

import com.agritainmen.common.core.ApiResponse;
import com.agritainmen.common.core.BusinessException;
import com.agritainmen.common.core.ErrorCode;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/after-sales")
public class AfterSaleController {
    private final JdbcTemplate jdbc;
    private final OrderAccessVerifier accessVerifier;
    public AfterSaleController(JdbcTemplate jdbc, OrderAccessVerifier accessVerifier) {
        this.jdbc = jdbc;
        this.accessVerifier = accessVerifier;
    }

    @GetMapping
    public ApiResponse<PageView> list(@RequestParam(required = false) String status,
                                      @RequestParam(defaultValue = "1") int page,
                                      @RequestParam(defaultValue = "20") int pageSize,
                                      @RequestHeader(value = "Authorization", required = false) String authorization) {
        accessVerifier.requireAdmin(authorization);
        if (page < 1 || pageSize < 1 || pageSize > 200) throw new BusinessException(ErrorCode.BAD_REQUEST, "page 必须大于 0，pageSize 必须在 1-200 之间");
        String normalized = status == null ? "" : status.trim();
        String where = normalized.isBlank() ? " where deleted=false" : " where deleted=false and status=?";
        Object[] args = normalized.isBlank() ? new Object[0] : new Object[]{normalized};
        Long total = jdbc.queryForObject("select count(*) from after_sale_case" + where, Long.class, args);
        Object[] pageArgs = new Object[args.length + 2];
        System.arraycopy(args, 0, pageArgs, 0, args.length);
        pageArgs[args.length] = pageSize;
        pageArgs[args.length + 1] = (page - 1) * pageSize;
        List<Map<String, Object>> items = jdbc.queryForList("select id, order_id, sub_order_id, buyer_id, supplier_id, type, status, reason, amount_cents, refunded_cents, return_tracking_no, created_at from after_sale_case" + where + " order by created_at, id limit ? offset ?", pageArgs);
        return ApiResponse.ok(new PageView(items, page, pageSize, total == null ? 0 : total));
    }

    public record PageView(List<Map<String, Object>> items, int page, int pageSize, long total) {}
}

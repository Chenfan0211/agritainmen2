package com.agritainmen.fulfillment.web;

import com.agritainmen.common.core.ApiResponse;
import com.agritainmen.common.core.BusinessException;
import com.agritainmen.common.core.ErrorCode;
import com.agritainmen.common.core.Ids;
import com.agritainmen.fulfillment.provider.LogisticsProvider;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Collections;
import java.util.HashSet;

@RestController
@RequestMapping("/api/v1/fulfillment")
public class FulfillmentController {
    private static final int MAX_PAGE_SIZE = 200;
    private final JdbcTemplate jdbc;
    private final LogisticsProvider logisticsProvider;
    private final FulfillmentAccessVerifier accessVerifier;
    public FulfillmentController(JdbcTemplate jdbc, LogisticsProvider logisticsProvider, FulfillmentAccessVerifier accessVerifier) {
        this.jdbc = jdbc; this.logisticsProvider = logisticsProvider; this.accessVerifier = accessVerifier;
    }
    public record CreateRequest(@NotBlank String orderId, @NotBlank String supplierId) {}
    public record ShipRequest(@NotBlank String shipType, String trackingNo, String driverId) {}
    public record AssignDriverRequest(@NotBlank String driverId, String expectedDriverId) {}
    public record BatchAcceptRequest(List<String> ids) {}
    public record BatchAcceptResult(int accepted) {}
    public record PageView(List<Map<String, Object>> items, int page, int pageSize, long total) {}

    @PostMapping("/orders")
    @Transactional
    public ApiResponse<String> create(@Valid @RequestBody CreateRequest request,
                                      @RequestHeader(value = "Authorization", required = false) String authorization) {
        if (!"admin".equals(accessVerifier.verify(authorization).actorType())) throw new BusinessException(ErrorCode.FORBIDDEN);
        var found = jdbc.queryForList("select id from fulfillment_order where order_id=? and deleted=false", request.orderId());
        if (!found.isEmpty()) return ApiResponse.ok(String.valueOf(found.get(0).get("id")));
        String id = Ids.uuid("FUL");
        jdbc.update("insert into fulfillment_order(id,tenant_id,order_id,supplier_id,status,created_at,updated_at,version,deleted) values (?, 'PLATFORM', ?, ?, 'PENDING', current_timestamp, current_timestamp, 0, false)", id, request.orderId(), request.supplierId());
        return ApiResponse.ok(id);
    }

    @GetMapping("/orders")
    public ApiResponse<PageView> list(@RequestParam(required = false) String supplierId,
                                      @RequestParam(defaultValue = "1") int page,
                                      @RequestParam(defaultValue = "20") int pageSize,
                                      @RequestHeader(value = "Authorization", required = false) String authorization) {
        FulfillmentAccessVerifier.Identity identity = accessVerifier.verify(authorization);
        if (page < 1 || pageSize < 1 || pageSize > MAX_PAGE_SIZE) throw new BusinessException(ErrorCode.BAD_REQUEST, "page 必须大于 0，pageSize 必须在 1-200 之间");
        String normalized = "admin".equals(identity.actorType()) ? (supplierId == null ? "" : supplierId.trim()) : identity.supplierId();
        if (!"admin".equals(identity.actorType()) && !"supplier".equals(identity.actorType()) && !"driver".equals(identity.actorType())) throw new BusinessException(ErrorCode.FORBIDDEN);
        String where = normalized.isBlank() ? " where deleted=false" : " where deleted=false and supplier_id=?";
        Object[] queryArgs = normalized.isBlank() ? new Object[0] : new Object[]{normalized};
        if ("driver".equals(identity.actorType())) {
            where += " and driver_id=?";
            queryArgs = new Object[]{normalized, identity.driverId()};
        }
        Long total = jdbc.queryForObject("select count(*) from fulfillment_order" + where, Long.class, queryArgs);
        Object[] pageArgs = new Object[queryArgs.length + 2];
        System.arraycopy(queryArgs, 0, pageArgs, 0, queryArgs.length);
        pageArgs[queryArgs.length] = pageSize;
        pageArgs[queryArgs.length + 1] = (page - 1) * pageSize;
        List<Map<String, Object>> items = jdbc.queryForList("select id, order_id, supplier_id, status, ship_type, tracking_no, driver_id from fulfillment_order" + where + " order by created_at, id limit ? offset ?", pageArgs);
        return ApiResponse.ok(new PageView(items, page, pageSize, total == null ? 0 : total));
    }

    @PostMapping("/orders/{id}/accept")
    public ApiResponse<Map<String, Object>> accept(@PathVariable String id,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        FulfillmentAccessVerifier.Identity identity = supplierIdentity(authorization);
        find(id, identity);
        transition(id, identity.supplierId(), "PENDING", "ACCEPTED");
        return ApiResponse.ok(find(id, identity));
    }

    @PostMapping("/orders/batch-accept")
    @Transactional
    public ApiResponse<BatchAcceptResult> batchAccept(@RequestBody BatchAcceptRequest request,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        FulfillmentAccessVerifier.Identity identity = supplierIdentity(authorization);
        if (request.ids() == null || request.ids().isEmpty() || request.ids().size() > 100
                || request.ids().stream().anyMatch(id -> id == null || id.isBlank()))
            throw new BusinessException(ErrorCode.BAD_REQUEST, "请选择1到100个履约单");
        List<String> ids = request.ids().stream().map(String::trim).toList();
        if (new HashSet<>(ids).size() != ids.size()) throw new BusinessException(ErrorCode.BAD_REQUEST, "履约单编号不能重复");
        String placeholders = String.join(",", Collections.nCopies(ids.size(), "?"));
        Object[] args = new Object[ids.size() + 1];
        args[0] = identity.supplierId();
        for (int index = 0; index < ids.size(); index++) args[index + 1] = ids.get(index);
        List<Map<String, Object>> rows = jdbc.queryForList("select id,status from fulfillment_order where supplier_id=? and deleted=false and id in (" + placeholders + ")", args);
        if (rows.size() != ids.size()) throw new BusinessException(ErrorCode.NOT_FOUND, "履约单不存在");
        if (rows.stream().anyMatch(row -> !"PENDING".equals(row.get("status"))))
            throw new BusinessException(ErrorCode.CONFLICT, "所选履约单包含不可接单状态");
        int updated = jdbc.update("update fulfillment_order set status='ACCEPTED', updated_at=current_timestamp, version=version+1 where supplier_id=? and status='PENDING' and deleted=false and id in (" + placeholders + ")", args);
        if (updated != ids.size()) throw new BusinessException(ErrorCode.CONFLICT, "履约单状态已变化，请刷新后重试");
        return ApiResponse.ok(new BatchAcceptResult(updated));
    }

    @PostMapping("/orders/{id}/assign-driver")
    public ApiResponse<Map<String, Object>> assignDriver(@PathVariable String id, @Valid @RequestBody AssignDriverRequest request,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        FulfillmentAccessVerifier.Identity identity = supplierIdentity(authorization);
        find(id, identity);
        accessVerifier.requireActiveDriver(authorization, request.driverId());
        if (request.expectedDriverId() != null && request.expectedDriverId().isBlank())
            throw new BusinessException(ErrorCode.BAD_REQUEST, "原司机编号不能为空");
        String expectedClause = request.expectedDriverId() == null ? "driver_id is null" : "driver_id=?";
        String sql = "update fulfillment_order set driver_id=?, updated_at=current_timestamp, version=version+1 "
                + "where id=? and supplier_id=? and status='ACCEPTED' and deleted=false and " + expectedClause;
        int updated = request.expectedDriverId() == null
                ? jdbc.update(sql, request.driverId(), id, identity.supplierId())
                : jdbc.update(sql, request.driverId(), id, identity.supplierId(), request.expectedDriverId());
        if (updated != 1) throw new BusinessException(ErrorCode.CONFLICT, "订单状态或司机指派已变化，请刷新后重试");
        return ApiResponse.ok(find(id, identity));
    }

    @PostMapping("/orders/{id}/ship")
    @Transactional
    public ApiResponse<Map<String, Object>> ship(@PathVariable String id, @Valid @RequestBody ShipRequest request,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        FulfillmentAccessVerifier.Identity identity = supplierIdentity(authorization);
        Map<String, Object> order = find(id, identity);
        String trackingNo = request.trackingNo();
        if ("courier".equals(request.shipType()) && (trackingNo == null || trackingNo.isBlank())) {
            trackingNo = logisticsProvider.createShipment(String.valueOf(order.get("order_id")), String.valueOf(order.get("supplier_id")), "").trackingNo();
        }
        if (!"courier".equals(request.shipType()) && !"driver".equals(request.shipType())) throw new BusinessException(ErrorCode.BAD_REQUEST, "shipType 只支持 courier 或 driver");
        if ("driver".equals(request.shipType())) accessVerifier.requireActiveDriver(authorization, request.driverId());
        int updated = "driver".equals(request.shipType())
                ? jdbc.update("update fulfillment_order set status='SHIPPED', ship_type='driver', tracking_no=?, updated_at=current_timestamp, version=version+1 where id=? and supplier_id=? and driver_id=? and status='ACCEPTED' and deleted=false",
                    trackingNo, id, identity.supplierId(), request.driverId())
                : jdbc.update("update fulfillment_order set status='SHIPPED', ship_type='courier', tracking_no=?, driver_id=null, updated_at=current_timestamp, version=version+1 where id=? and supplier_id=? and status='ACCEPTED' and deleted=false",
                    trackingNo, id, identity.supplierId());
        if (updated != 1) throw new BusinessException(ErrorCode.CONFLICT, "订单未接单或已完成，不能发货");
        return ApiResponse.ok(find(id, identity));
    }

    @GetMapping("/logistics/{trackingNo}")
    public ApiResponse<LogisticsProvider.Tracking> tracking(@PathVariable String trackingNo,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        FulfillmentAccessVerifier.Identity identity = accessVerifier.verify(authorization);
        if (!"admin".equals(identity.actorType())) {
            if (!"supplier".equals(identity.actorType()) && !"driver".equals(identity.actorType())) throw new BusinessException(ErrorCode.FORBIDDEN);
            String sql = "select count(*) from fulfillment_order where tracking_no=? and supplier_id=? and deleted=false"
                    + ("driver".equals(identity.actorType()) ? " and driver_id=?" : "");
            Object[] args = "driver".equals(identity.actorType())
                    ? new Object[]{trackingNo, identity.supplierId(), identity.driverId()}
                    : new Object[]{trackingNo, identity.supplierId()};
            Integer count = jdbc.queryForObject(sql, Integer.class, args);
            if (count == null || count == 0) throw new BusinessException(ErrorCode.NOT_FOUND, "物流单不存在");
        }
        return ApiResponse.ok(logisticsProvider.query(trackingNo));
    }

    private FulfillmentAccessVerifier.Identity supplierIdentity(String authorization) {
        FulfillmentAccessVerifier.Identity identity = accessVerifier.verify(authorization);
        if (!"supplier".equals(identity.actorType())) throw new BusinessException(ErrorCode.FORBIDDEN);
        return identity;
    }
    private void transition(String id, String supplierId, String from, String to) {
        int updated = jdbc.update("update fulfillment_order set status=?, updated_at=current_timestamp, version=version+1 where id=? and supplier_id=? and status=? and deleted=false", to, id, supplierId, from);
        if (updated != 1) throw new BusinessException(ErrorCode.CONFLICT, "当前履约状态不允许该操作");
    }
    private Map<String, Object> find(String id, FulfillmentAccessVerifier.Identity identity) {
        var rows = jdbc.queryForList("select id, order_id, supplier_id, status, ship_type, tracking_no, driver_id from fulfillment_order where id=? and supplier_id=? and deleted=false", id, identity.supplierId());
        if (rows.isEmpty()) throw new BusinessException(ErrorCode.NOT_FOUND, "履约单不存在");
        return rows.get(0);
    }
}

package com.agritainmen.order.web;

import com.agritainmen.common.core.ApiResponse;
import com.agritainmen.common.core.BusinessException;
import com.agritainmen.common.core.ErrorCode;
import com.agritainmen.order.service.OrderService;
import com.agritainmen.order.web.OrderDtos.CreateOrderRequest;
import com.agritainmen.order.web.OrderDtos.OrderView;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/orders")
public class OrderController {
    private final OrderService orderService;
    private final OrderAccessVerifier accessVerifier;

    public OrderController(OrderService orderService, OrderAccessVerifier accessVerifier) {
        this.orderService = orderService;
        this.accessVerifier = accessVerifier;
    }

    @PostMapping
    public ApiResponse<OrderView> create(@Valid @RequestBody CreateOrderRequest request,
                                         @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
                                         @RequestHeader(value = "Authorization", required = false) String authorization) {
        accessVerifier.requireBuyer(authorization, request.buyerId());
        return ApiResponse.ok(orderService.create(idempotencyKey, request));
    }

    @GetMapping
    public ApiResponse<OrderPage> list(@RequestParam(required = false) String buyerId,
                                       @RequestParam(defaultValue = "1") int page,
                                       @RequestParam(defaultValue = "20") int pageSize,
                                       @RequestHeader(value = "Authorization", required = false) String authorization) {
        if (page < 1 || pageSize < 1 || pageSize > 200) throw new BusinessException(ErrorCode.BAD_REQUEST, "page 必须大于 0，pageSize 必须在 1-200 之间");
        return ApiResponse.ok(orderService.list(accessVerifier.visibleBuyer(authorization, buyerId), page, pageSize));
    }

    @GetMapping("/{id}")
    public ApiResponse<OrderView> find(@PathVariable String id,
                                      @RequestHeader(value = "Authorization", required = false) String authorization) {
        OrderAccessVerifier.Identity identity = accessVerifier.verify(authorization);
        OrderView order = orderService.find(id);
        accessVerifier.requireReadable(identity, order.buyerId());
        return ApiResponse.ok(order);
    }

    @PostMapping("/{id}/cancel")
    public ApiResponse<OrderView> cancel(@PathVariable String id,
                                         @RequestHeader(value = "Authorization", required = false) String authorization) {
        OrderAccessVerifier.Identity identity = accessVerifier.verify(authorization);
        OrderView order = orderService.find(id);
        accessVerifier.requireReadable(identity, order.buyerId());
        return ApiResponse.ok(orderService.cancelPending(id));
    }

    public record OrderPage(java.util.List<OrderView> items, int page, int pageSize, long total) {}
}

package com.agritainmen.inventory.web;

import com.agritainmen.common.core.ApiResponse;
import com.agritainmen.inventory.service.InventoryService;
import com.agritainmen.inventory.web.InventoryDtos.AdjustRequest;
import com.agritainmen.inventory.web.InventoryDtos.ReservationView;
import com.agritainmen.inventory.web.InventoryDtos.ReserveRequest;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/inventory")
public class InventoryController {
    private final InventoryService inventoryService;

    public InventoryController(InventoryService inventoryService) {
        this.inventoryService = inventoryService;
    }

    @PostMapping("/reservations")
    public ApiResponse<ReservationView> reserve(@Valid @RequestBody ReserveRequest request,
                                                @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey) {
        return ApiResponse.ok(inventoryService.reserve(request.orderId(), request.items(), request.expiresAt(), idempotencyKey));
    }

    @PostMapping("/reservations/{id}/release")
    public ApiResponse<ReservationView> release(@PathVariable String id) {
        return ApiResponse.ok(inventoryService.release(id));
    }

    @PostMapping("/reservations/{id}/confirm")
    public ApiResponse<ReservationView> confirm(@PathVariable String id) {
        return ApiResponse.ok(inventoryService.confirm(id));
    }

    @PostMapping("/skus/{skuId}/adjust")
    public ApiResponse<Void> adjust(@PathVariable String skuId, @Valid @RequestBody AdjustRequest request) {
        inventoryService.adjust(skuId, request.delta(), request.reason());
        return ApiResponse.ok();
    }

    @GetMapping("/available")
    public ApiResponse<java.util.Map<String, Integer>> availableBatch(@RequestParam String skuIds) {
        java.util.List<String> ids = java.util.Arrays.stream(skuIds.split(","))
                .map(String::trim).filter(value -> !value.isBlank()).distinct().toList();
        java.util.Map<String, Integer> result = new java.util.LinkedHashMap<>();
        for (String skuId : ids) result.put(skuId, inventoryService.available(skuId));
        return ApiResponse.ok(result);
    }
    @GetMapping("/skus/{skuId}/available")
    public ApiResponse<Integer> available(@PathVariable String skuId) {
        return ApiResponse.ok(inventoryService.available(skuId));
    }
}

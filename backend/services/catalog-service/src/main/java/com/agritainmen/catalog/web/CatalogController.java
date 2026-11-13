package com.agritainmen.catalog.web;

import com.agritainmen.catalog.service.CatalogService;
import com.agritainmen.catalog.web.CatalogDtos.CategoryView;
import com.agritainmen.catalog.web.CatalogDtos.PageView;
import com.agritainmen.catalog.web.CatalogDtos.PricePolicyView;
import com.agritainmen.catalog.web.CatalogDtos.ProductView;
import com.agritainmen.catalog.web.CatalogDtos.QuoteView;
import com.agritainmen.common.core.ApiResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/catalog")
public class CatalogController {
    private final CatalogService catalogService;
    public CatalogController(CatalogService catalogService) { this.catalogService = catalogService; }

    @GetMapping("/skus/{skuId}/quote")
    public ApiResponse<QuoteView> quote(@PathVariable String skuId) { return ApiResponse.ok(catalogService.quote(skuId)); }

    @GetMapping("/products")
    public ApiResponse<PageView<ProductView>> products(@RequestParam(defaultValue = "1") int page,
                                                       @RequestParam(defaultValue = "20") int pageSize,
                                                       @RequestParam(required = false) String channel,
                                                       @RequestParam(required = false) String keyword) {
        return ApiResponse.ok(catalogService.products(page, pageSize, channel, keyword));
    }

    @GetMapping("/categories")
    public ApiResponse<java.util.List<CategoryView>> categories() { return ApiResponse.ok(catalogService.categories()); }

    @GetMapping("/prices")
    public ApiResponse<java.util.List<PricePolicyView>> prices() { return ApiResponse.ok(catalogService.prices()); }
}

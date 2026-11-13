package com.agritainmen.catalog.web;

import java.util.List;

public final class CatalogDtos {
    private CatalogDtos() {}
    public record QuoteView(String skuId, String productId, String supplierId, String name, long unitPriceCents) {}
    public record SkuView(String id, String name, long priceCents, boolean enabled) {}
    public record ProductView(String id, String supplierId, String name, String category, String channel, boolean enabled, List<SkuView> skus) {}
    public record PageView<T>(List<T> items, int page, int pageSize, long total) {}
    public record CategoryView(String id, String code, String name, String icon, int sortOrder, boolean enabled) {}
    public record PricePolicyView(String id, String name, String scope, String targetId, double discountRate, boolean enabled) {}
}

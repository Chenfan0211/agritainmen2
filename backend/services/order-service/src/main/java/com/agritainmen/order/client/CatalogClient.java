package com.agritainmen.order.client;

import com.agritainmen.order.web.OrderDtos.PriceQuote;

public interface CatalogClient {
    PriceQuote quote(String skuId);
}

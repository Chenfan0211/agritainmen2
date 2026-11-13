package com.agritainmen.catalog.service;

import com.agritainmen.catalog.web.CatalogDtos.PageView;
import com.agritainmen.catalog.web.CatalogDtos.ProductView;
import com.agritainmen.catalog.web.CatalogDtos.QuoteView;
import com.agritainmen.catalog.web.CatalogDtos.SkuView;
import com.agritainmen.common.core.BusinessException;
import com.agritainmen.common.core.ErrorCode;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class CatalogService {
    private static final int MAX_PAGE_SIZE = 200;
    private final JdbcTemplate jdbc;

    public CatalogService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public QuoteView quote(String skuId) {
        List<QuoteView> rows = jdbc.query("""
                select s.id sku_id, p.id product_id, p.supplier_id, p.name, s.price_cents
                  from catalog_sku s join catalog_product p on p.id = s.product_id
                 where s.id = ? and s.enabled = true and s.deleted = false and p.enabled = true and p.deleted = false
                """, (rs, rowNum) -> new QuoteView(rs.getString("sku_id"), rs.getString("product_id"), rs.getString("supplier_id"), rs.getString("name"), rs.getLong("price_cents")), skuId);
        if (rows.isEmpty()) throw new BusinessException(ErrorCode.NOT_FOUND, "商品 SKU 不存在或已下架");
        return rows.get(0);
    }

    public java.util.List<com.agritainmen.catalog.web.CatalogDtos.CategoryView> categories() {
        return jdbc.query("select id, code, name, icon, sort_order, enabled from catalog_category where deleted=false order by sort_order, name",
                (rs, rowNum) -> new com.agritainmen.catalog.web.CatalogDtos.CategoryView(rs.getString("id"), rs.getString("code"), rs.getString("name"), rs.getString("icon"), rs.getInt("sort_order"), rs.getBoolean("enabled")));
    }

    public java.util.List<com.agritainmen.catalog.web.CatalogDtos.PricePolicyView> prices() {
        return jdbc.query("select id, name, scope, target_id, discount_rate, enabled from catalog_price_policy where deleted=false order by name",
                (rs, rowNum) -> new com.agritainmen.catalog.web.CatalogDtos.PricePolicyView(rs.getString("id"), rs.getString("name"), rs.getString("scope"), rs.getString("target_id"), rs.getDouble("discount_rate"), rs.getBoolean("enabled")));
    }
    public PageView<ProductView> products(int page, int pageSize, String channel, String keyword) {
        if (page < 1 || pageSize < 1 || pageSize > MAX_PAGE_SIZE) throw new BusinessException(ErrorCode.BAD_REQUEST, "page 必须大于 0，pageSize 必须在 1-200 之间");
        String normalizedChannel = channel == null ? "" : channel.trim().toLowerCase();
        String normalizedKeyword = keyword == null ? "" : keyword.trim().toLowerCase();
        StringBuilder where = new StringBuilder(" where p.enabled=true and p.deleted=false and s.enabled=true and s.deleted=false");
        List<Object> args = new java.util.ArrayList<>();
        if (!normalizedChannel.isBlank()) { where.append(" and p.channel=?"); args.add(normalizedChannel); }
        if (!normalizedKeyword.isBlank()) { where.append(" and lower(p.name) like ?"); args.add("%" + normalizedKeyword + "%"); }
        Long total = jdbc.queryForObject("select count(distinct p.id) from catalog_product p join catalog_sku s on s.product_id=p.id" + where, Long.class, args.toArray());
        List<ProductView> items = jdbc.query("""
                select p.id, p.supplier_id, p.name, p.category, p.channel, p.enabled,
                       s.id sku_id, s.name sku_name, s.price_cents, s.enabled sku_enabled
                  from catalog_product p join catalog_sku s on s.product_id=p.id
                """ + where + " order by p.id, s.id limit ? offset ?", (rs, rowNum) -> new ProductView(rs.getString("id"), rs.getString("supplier_id"), rs.getString("name"), rs.getString("category"), rs.getString("channel"), rs.getBoolean("enabled"), List.of(new SkuView(rs.getString("sku_id"), rs.getString("sku_name"), rs.getLong("price_cents"), rs.getBoolean("sku_enabled")))), appendLimit(args, pageSize, (page - 1) * pageSize));
        return new PageView<>(items, page, pageSize, total == null ? 0 : total);
    }

    private Object[] appendLimit(List<Object> args, int pageSize, int offset) {
        List<Object> all = new java.util.ArrayList<>(args);
        all.add(pageSize);
        all.add(offset);
        return all.toArray();
    }
}

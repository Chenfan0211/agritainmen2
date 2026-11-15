package db.migration;

import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

public class V3__multi_supplier_fulfillment extends BaseJavaMigration {
    private static final String NEW_NAME = "uq_fulfillment_order_supplier";

    @Override
    public void migrate(Context context) throws Exception {
        Connection connection = context.getConnection();
        String product = connection.getMetaData().getDatabaseProductName();
        if (!"MySQL".equals(product) && !"H2".equals(product))
            throw new IllegalStateException("不支持的履约数据库: " + product);
        String schema = "MySQL".equals(product) ? connection.getCatalog() : connection.getSchema();
        String oldName = null;
        boolean newExists = false;
        try (PreparedStatement statement = connection.prepareStatement("""
                select constraint_name from information_schema.table_constraints
                 where table_schema=? and table_name='fulfillment_order' and constraint_type='UNIQUE'
                """)) {
            statement.setString(1, schema);
            try (ResultSet rows = statement.executeQuery()) {
                while (rows.next()) {
                    String name = rows.getString(1);
                    List<String> columns = columns(connection, schema, name);
                    if (columns.equals(List.of("tenant_id", "order_id"))) oldName = name;
                    if (NEW_NAME.equalsIgnoreCase(name) && columns.equals(List.of("tenant_id", "order_id", "supplier_id")))
                        newExists = true;
                }
            }
        }
        if (oldName == null && !newExists) throw new IllegalStateException("未找到原履约订单唯一约束");
        try (Statement statement = connection.createStatement()) {
            if (!newExists) statement.execute("alter table fulfillment_order add constraint " + NEW_NAME
                    + " unique (tenant_id, order_id, supplier_id)");
            if (oldName != null) {
                if (!oldName.matches("[A-Za-z0-9_]+")) throw new IllegalStateException("原唯一约束名称非法");
                String quote = connection.getMetaData().getIdentifierQuoteString().trim();
                String drop = "MySQL".equals(product) ? "drop index " : "drop constraint ";
                statement.execute("alter table fulfillment_order " + drop + quote + oldName + quote);
            }
        }
    }

    private List<String> columns(Connection connection, String schema, String name) throws Exception {
        List<String> result = new ArrayList<>();
        try (PreparedStatement statement = connection.prepareStatement("""
                select column_name from information_schema.key_column_usage
                 where table_schema=? and table_name='fulfillment_order' and constraint_name=?
                 order by ordinal_position
                """)) {
            statement.setString(1, schema);
            statement.setString(2, name);
            try (ResultSet rows = statement.executeQuery()) {
                while (rows.next()) result.add(rows.getString(1).toLowerCase());
            }
        }
        return result;
    }
}

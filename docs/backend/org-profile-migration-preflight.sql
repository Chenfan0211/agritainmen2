-- 在 org-service Flyway V4 执行前，对现有 MySQL org 库只读检查。
-- 返回行必须人工核对并处理；不能按 ID 自动删除供应商资料。
select tenant_id, contact_phone, count(*) as duplicate_count,
       group_concat(id order by id separator ',') as supplier_ids
from org_supplier
where contact_phone is not null
group by tenant_id, contact_phone
having count(*) > 1;

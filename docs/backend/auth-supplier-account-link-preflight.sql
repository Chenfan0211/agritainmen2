-- 在 auth-service Flyway V3 与 org-service Flyway V4 执行后只读核对。
-- 同手机号只是候选关系，不能据此自动设置 supplier_id。
-- 每行须核实账号实际归属；无候选或多个候选也要人工处理。
select a.id as auth_account_id, a.account, a.display_name, a.enabled,
       s.id as candidate_supplier_id, s.name as candidate_supplier_name,
       s.status as candidate_supplier_status, s.certified as candidate_supplier_certified
from agritainmen_auth.auth_account a
left join agritainmen_org.org_supplier s
  on s.tenant_id = a.tenant_id and s.contact_phone = a.account and s.deleted = false
where a.actor_type = 'supplier' and a.deleted = false and a.supplier_id is null
order by a.account, s.id;

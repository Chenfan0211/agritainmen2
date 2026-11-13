alter table org_supplier add column profile_json longtext;
alter table org_supplier add column certified boolean not null default false;
update org_supplier set certified=true where status='cooperating';
alter table org_farm add column contact varchar(128);
alter table org_farm add column contact_phone varchar(32);
alter table org_farm add column profile_json longtext;
-- 手机号作为供应商登录身份永久占用；软删除也不释放，避免旧账号误绑定新主体。
-- 上线前先运行 docs/backend/org-profile-migration-preflight.sql 的迁移前查询。
create unique index uk_org_supplier_tenant_phone on org_supplier(tenant_id, contact_phone);

alter table auth_account add column supplier_id varchar(64);
create unique index uk_auth_account_supplier on auth_account (tenant_id, supplier_id);

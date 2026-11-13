alter table auth_account add column driver_supplier_id varchar(64);
alter table auth_account add column driver_phone varchar(32);
create index idx_auth_account_driver_supplier on auth_account (driver_supplier_id);

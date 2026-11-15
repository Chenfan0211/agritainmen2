alter table auth_account add column store_account_id varchar(64);
alter table auth_account add column farm_id varchar(64);
create unique index uk_auth_account_store_account on auth_account (store_account_id);

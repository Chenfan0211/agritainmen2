create table catalog_product (
  id varchar(64) primary key,
  tenant_id varchar(64) not null default 'PLATFORM',
  supplier_id varchar(64) not null,
  name varchar(255) not null,
  category varchar(64) not null,
  channel varchar(32) not null,
  enabled boolean not null default true,
  created_at timestamp not null,
  updated_at timestamp not null,
  version bigint not null default 0,
  deleted boolean not null default false
);

create table catalog_sku (
  id varchar(64) primary key,
  tenant_id varchar(64) not null default 'PLATFORM',
  product_id varchar(64) not null,
  name varchar(128) not null,
  price_cents bigint not null,
  enabled boolean not null default true,
  created_at timestamp not null,
  updated_at timestamp not null,
  version bigint not null default 0,
  deleted boolean not null default false,
  check (price_cents >= 0)
);

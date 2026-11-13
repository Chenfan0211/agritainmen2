create table catalog_category (
  id varchar(64) primary key,
  tenant_id varchar(64) not null default 'PLATFORM',
  code varchar(64) not null,
  name varchar(128) not null,
  icon varchar(255),
  sort_order integer not null default 0,
  enabled boolean not null default true,
  created_at timestamp not null,
  updated_at timestamp not null,
  version bigint not null default 0,
  deleted boolean not null default false,
  unique (tenant_id, code)
);

create table catalog_price_policy (
  id varchar(64) primary key,
  tenant_id varchar(64) not null default 'PLATFORM',
  name varchar(128) not null,
  scope varchar(32) not null,
  target_id varchar(64),
  discount_rate decimal(6,4) not null default 1.0000,
  enabled boolean not null default true,
  created_at timestamp not null,
  updated_at timestamp not null,
  version bigint not null default 0,
  deleted boolean not null default false
);

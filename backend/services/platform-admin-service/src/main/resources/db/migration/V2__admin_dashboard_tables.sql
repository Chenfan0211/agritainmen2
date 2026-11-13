create table trade_order_daily (
  id varchar(64) primary key,
  tenant_id varchar(64) not null default 'PLATFORM',
  order_date date not null,
  order_count integer not null default 0,
  gmv_cents bigint not null default 0,
  created_at timestamp not null,
  updated_at timestamp not null,
  version bigint not null default 0,
  deleted boolean not null default false
);

create table org_supplier_daily (
  id varchar(64) primary key,
  tenant_id varchar(64) not null default 'PLATFORM',
  supplier_id varchar(64) not null,
  created_at timestamp not null,
  updated_at timestamp not null,
  version bigint not null default 0,
  deleted boolean not null default false
);

create table org_farm_daily (
  id varchar(64) primary key,
  tenant_id varchar(64) not null default 'PLATFORM',
  farm_id varchar(64) not null,
  created_at timestamp not null,
  updated_at timestamp not null,
  version bigint not null default 0,
  deleted boolean not null default false
);

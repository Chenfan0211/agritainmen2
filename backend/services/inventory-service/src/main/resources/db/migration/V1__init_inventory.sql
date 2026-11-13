create table inventory_stock (
  id varchar(64) primary key,
  tenant_id varchar(64) not null default 'PLATFORM',
  sku_id varchar(64) not null,
  available_qty integer not null default 0,
  reserved_qty integer not null default 0,
  created_at timestamp not null,
  updated_at timestamp not null,
  version bigint not null default 0,
  deleted boolean not null default false,
  unique (tenant_id, sku_id),
  check (available_qty >= 0),
  check (reserved_qty >= 0)
);

create table inventory_reservation (
  id varchar(64) primary key,
  tenant_id varchar(64) not null default 'PLATFORM',
  reservation_no varchar(96) not null,
  order_id varchar(96) not null,
  status varchar(32) not null,
  expires_at timestamp not null,
  created_at timestamp not null,
  updated_at timestamp not null,
  version bigint not null default 0,
  deleted boolean not null default false,
  unique (tenant_id, order_id),
  unique (tenant_id, reservation_no)
);

create table inventory_reservation_item (
  id varchar(64) primary key,
  tenant_id varchar(64) not null default 'PLATFORM',
  reservation_id varchar(64) not null,
  sku_id varchar(64) not null,
  quantity integer not null,
  created_at timestamp not null,
  updated_at timestamp not null,
  version bigint not null default 0,
  deleted boolean not null default false,
  check (quantity > 0)
);

create table inventory_ledger (
  id varchar(64) primary key,
  tenant_id varchar(64) not null default 'PLATFORM',
  sku_id varchar(64) not null,
  change_type varchar(32) not null,
  quantity integer not null,
  reference_id varchar(96) not null,
  created_at timestamp not null
);

create table sys_outbox_event (
  id varchar(64) primary key,
  tenant_id varchar(64) not null default 'PLATFORM',
  aggregate_type varchar(64) not null,
  aggregate_id varchar(96) not null,
  event_type varchar(128) not null,
  payload text not null,
  status varchar(32) not null,
  retry_count integer not null default 0,
  next_retry_at timestamp,
  published_at timestamp,
  created_at timestamp not null,
  updated_at timestamp not null,
  version bigint not null default 0,
  deleted boolean not null default false
);

create index idx_inventory_reservation_status on inventory_reservation(status, expires_at);
create index idx_inventory_ledger_sku on inventory_ledger(sku_id, created_at);

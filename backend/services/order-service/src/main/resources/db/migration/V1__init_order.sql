create table trade_order_request (
  id varchar(64) primary key,
  tenant_id varchar(64) not null default 'PLATFORM',
  scene varchar(64) not null,
  idempotency_key varchar(128) not null,
  request_hash varchar(512) not null,
  order_id varchar(64) not null,
  created_at timestamp not null,
  updated_at timestamp not null,
  version bigint not null default 0,
  deleted boolean not null default false,
  unique (scene, idempotency_key)
);

create table trade_order (
  id varchar(64) primary key,
  tenant_id varchar(64) not null default 'PLATFORM',
  order_no varchar(96) not null,
  buyer_id varchar(64) not null,
  status varchar(32) not null,
  amount_cents bigint not null,
  reservation_id varchar(64),
  receiver varchar(128) not null,
  receiver_phone varchar(32) not null,
  address varchar(512) not null,
  created_at timestamp not null,
  updated_at timestamp not null,
  version bigint not null default 0,
  deleted boolean not null default false,
  unique (tenant_id, order_no)
);

create table trade_order_item (
  id varchar(64) primary key,
  tenant_id varchar(64) not null default 'PLATFORM',
  order_id varchar(64) not null,
  sku_id varchar(64) not null,
  product_id varchar(64) not null,
  supplier_id varchar(64) not null,
  product_name varchar(255) not null,
  unit_price_cents bigint not null,
  quantity integer not null,
  amount_cents bigint not null,
  created_at timestamp not null,
  updated_at timestamp not null,
  version bigint not null default 0,
  deleted boolean not null default false,
  check (quantity > 0),
  check (unit_price_cents >= 0),
  check (amount_cents >= 0)
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

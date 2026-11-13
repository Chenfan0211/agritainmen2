create table payment_intent (
  id varchar(64) primary key,
  tenant_id varchar(64) not null default 'PLATFORM',
  order_id varchar(64) not null,
  amount_cents bigint not null,
  channel varchar(32) not null,
  status varchar(32) not null,
  provider_txn_id varchar(128),
  paid_at timestamp,
  created_at timestamp not null,
  updated_at timestamp not null,
  version bigint not null default 0,
  deleted boolean not null default false,
  unique (tenant_id, order_id)
);

create table payment_callback_event (
  id varchar(64) primary key,
  tenant_id varchar(64) not null default 'PLATFORM',
  provider varchar(32) not null,
  provider_txn_id varchar(128) not null,
  order_id varchar(64) not null,
  success boolean not null,
  failure_reason varchar(255),
  created_at timestamp not null,
  unique (tenant_id, provider, provider_txn_id)
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

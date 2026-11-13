create table settlement_commission (
  id varchar(64) primary key,
  tenant_id varchar(64) not null default 'PLATFORM',
  source_id varchar(96) not null,
  beneficiary_id varchar(64) not null,
  amount_cents bigint not null,
  direction varchar(32) not null,
  status varchar(32) not null,
  created_at timestamp not null,
  updated_at timestamp not null,
  version bigint not null default 0,
  deleted boolean not null default false,
  unique (tenant_id, source_id, beneficiary_id, direction),
  check (amount_cents > 0)
);

create table settlement_withdrawal (
  id varchar(64) primary key,
  tenant_id varchar(64) not null default 'PLATFORM',
  requester_id varchar(64) not null,
  amount_cents bigint not null,
  method varchar(64) not null,
  status varchar(32) not null,
  reviewed_by varchar(64),
  reviewed_at timestamp,
  review_note varchar(512),
  created_at timestamp not null,
  updated_at timestamp not null,
  version bigint not null default 0,
  deleted boolean not null default false,
  check (amount_cents > 0)
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

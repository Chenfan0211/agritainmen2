create table admin_audit_log (
  id varchar(64) primary key,
  tenant_id varchar(64) not null default 'PLATFORM',
  actor_id varchar(64) not null,
  actor_role varchar(64) not null,
  module varchar(64) not null,
  action varchar(128) not null,
  target_id varchar(128),
  result varchar(32),
  reason varchar(512),
  created_at timestamp not null
);

create table admin_dictionary (
  id varchar(64) primary key,
  tenant_id varchar(64) not null default 'PLATFORM',
  group_code varchar(64) not null,
  item_code varchar(64) not null,
  label varchar(128) not null,
  sort_order integer not null default 0,
  enabled boolean not null default true,
  created_at timestamp not null,
  updated_at timestamp not null,
  version bigint not null default 0,
  deleted boolean not null default false,
  unique (tenant_id, group_code, item_code)
);

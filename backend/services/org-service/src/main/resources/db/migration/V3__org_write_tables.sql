create table org_farm_account (
  id varchar(64) primary key,
  tenant_id varchar(64) not null default 'PLATFORM',
  farm_id varchar(64) not null,
  account varchar(128) not null,
  display_name varchar(128) not null,
  role varchar(32) not null default 'owner',
  price_level varchar(8),
  enabled boolean not null default true,
  created_at timestamp not null,
  updated_at timestamp not null,
  version bigint not null default 0,
  deleted boolean not null default false,
  unique (tenant_id, account)
);

create table org_promoter (
  id varchar(64) primary key,
  tenant_id varchar(64) not null default 'PLATFORM',
  name varchar(128) not null,
  level varchar(32) not null default 'level1',
  region varchar(128),
  status varchar(32) not null default 'active',
  created_at timestamp not null,
  updated_at timestamp not null,
  version bigint not null default 0,
  deleted boolean not null default false
);

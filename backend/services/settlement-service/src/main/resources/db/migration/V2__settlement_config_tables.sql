create table settlement_commission_rule (
  id varchar(64) primary key,
  tenant_id varchar(64) not null default 'PLATFORM',
  name varchar(128) not null,
  promoter_rate decimal(6,4) not null default 0,
  store_rate decimal(6,4) not null default 0,
  enabled boolean not null default true,
  created_at timestamp not null,
  updated_at timestamp not null,
  version bigint not null default 0,
  deleted boolean not null default false
);
create table settlement_share_config (
  id varchar(64) primary key,
  tenant_id varchar(64) not null default 'PLATFORM',
  promoter_rate decimal(6,4),
  staff_rate decimal(6,4),
  leader_level1_rate decimal(6,4),
  leader_level2_rate decimal(6,4),
  created_at timestamp not null,
  updated_at timestamp not null,
  version bigint not null default 0,
  deleted boolean not null default false
);

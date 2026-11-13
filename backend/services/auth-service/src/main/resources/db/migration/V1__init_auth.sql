create table auth_role (
  id varchar(64) primary key,
  tenant_id varchar(64) not null default 'PLATFORM',
  code varchar(64) not null,
  name varchar(128) not null,
  permissions_json text,
  system_role boolean not null default false,
  enabled boolean not null default true,
  created_at timestamp not null,
  updated_at timestamp not null,
  version bigint not null default 0,
  deleted boolean not null default false,
  unique (tenant_id, code)
);

create table auth_account (
  id varchar(64) primary key,
  tenant_id varchar(64) not null default 'PLATFORM',
  actor_type varchar(32) not null,
  account varchar(128) not null,
  password_hash varchar(255) not null,
  display_name varchar(128) not null,
  enabled boolean not null default true,
  created_at timestamp not null,
  updated_at timestamp not null,
  version bigint not null default 0,
  deleted boolean not null default false,
  unique (tenant_id, actor_type, account)
);

create table auth_account_role (
  id varchar(64) primary key,
  tenant_id varchar(64) not null default 'PLATFORM',
  account_id varchar(64) not null,
  role_id varchar(64) not null,
  enabled boolean not null default true,
  created_at timestamp not null,
  updated_at timestamp not null,
  version bigint not null default 0,
  deleted boolean not null default false,
  unique (tenant_id, account_id, role_id)
);

create table auth_identity (
  id varchar(64) primary key,
  tenant_id varchar(64) not null default 'PLATFORM',
  openid varchar(128) not null,
  user_id varchar(64) not null,
  nickname varchar(128),
  avatar_url varchar(512),
  level varchar(32) not null default 'normal',
  leader_id varchar(64),
  parent_leader_id varchar(64),
  status varchar(32) not null default 'active',
  created_at timestamp not null,
  updated_at timestamp not null,
  version bigint not null default 0,
  deleted boolean not null default false,
  unique (tenant_id, openid),
  unique (tenant_id, user_id)
);

create table auth_session (
  id varchar(64) primary key,
  tenant_id varchar(64) not null default 'PLATFORM',
  actor_type varchar(32) not null,
  actor_id varchar(64) not null,
  refresh_token_hash varchar(128) not null,
  expires_at timestamp not null,
  revoked_at timestamp,
  created_at timestamp not null,
  updated_at timestamp not null,
  version bigint not null default 0,
  deleted boolean not null default false,
  unique (refresh_token_hash)
);

create table sys_idempotency_record (
  id varchar(64) primary key,
  tenant_id varchar(64) not null default 'PLATFORM',
  scene varchar(64) not null,
  idempotency_key varchar(128) not null,
  request_hash varchar(128) not null,
  status varchar(32) not null,
  response_status integer,
  response_body text,
  expires_at timestamp not null,
  created_at timestamp not null,
  updated_at timestamp not null,
  version bigint not null default 0,
  deleted boolean not null default false,
  unique (scene, idempotency_key)
);

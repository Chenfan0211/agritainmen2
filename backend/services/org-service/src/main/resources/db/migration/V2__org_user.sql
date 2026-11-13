create table org_user (
  id varchar(64) primary key,
  tenant_id varchar(64) not null default 'PLATFORM',
  nickname varchar(128),
  phone varchar(32),
  level varchar(32) not null default 'normal',
  leader_id varchar(64),
  parent_leader_id varchar(64),
  source_channel varchar(64),
  status varchar(32) not null default 'active',
  created_at timestamp not null,
  updated_at timestamp not null,
  version bigint not null default 0,
  deleted boolean not null default false
);

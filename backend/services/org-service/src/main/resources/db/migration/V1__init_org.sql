create table org_supplier (
  id varchar(64) primary key,
  tenant_id varchar(64) not null default 'PLATFORM',
  name varchar(255) not null,
  contact_phone varchar(32),
  region varchar(128),
  category varchar(128),
  status varchar(32) not null,
  created_at timestamp not null,
  updated_at timestamp not null,
  version bigint not null default 0,
  deleted boolean not null default false
);

create table org_farm (
  id varchar(64) primary key,
  tenant_id varchar(64) not null default 'PLATFORM',
  name varchar(255) not null,
  region varchar(128),
  status varchar(32) not null,
  created_at timestamp not null,
  updated_at timestamp not null,
  version bigint not null default 0,
  deleted boolean not null default false
);

create table org_driver (
  id varchar(64) primary key,
  tenant_id varchar(64) not null default 'PLATFORM',
  supplier_id varchar(64) not null,
  name varchar(128) not null,
  phone varchar(32),
  status varchar(32) not null,
  created_at timestamp not null,
  updated_at timestamp not null,
  version bigint not null default 0,
  deleted boolean not null default false
);

create table org_leader (
  id varchar(64) primary key,
  tenant_id varchar(64) not null default 'PLATFORM',
  name varchar(128) not null,
  level varchar(32) not null,
  leader_id varchar(64),
  parent_leader_id varchar(64),
  status varchar(32) not null,
  created_at timestamp not null,
  updated_at timestamp not null,
  version bigint not null default 0,
  deleted boolean not null default false
);

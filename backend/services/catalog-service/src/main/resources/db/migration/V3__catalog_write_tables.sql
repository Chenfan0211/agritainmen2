create table catalog_pricing_default (
  id varchar(64) primary key,
  tenant_id varchar(64) not null default 'PLATFORM',
  store_level_a_rate decimal(6,4) not null default 0.9500,
  store_level_b_rate decimal(6,4) not null default 0.9700,
  store_level_c_rate decimal(6,4) not null default 1.0000,
  created_at timestamp not null,
  updated_at timestamp not null,
  version bigint not null default 0,
  deleted boolean not null default false
);

create table catalog_product_submission (
  id varchar(64) primary key,
  tenant_id varchar(64) not null default 'PLATFORM',
  product_id varchar(64),
  supplier_id varchar(64) not null,
  payload text not null,
  status varchar(32) not null,
  review_note varchar(512),
  reviewed_by varchar(64),
  reviewed_at timestamp,
  created_at timestamp not null,
  updated_at timestamp not null,
  version bigint not null default 0,
  deleted boolean not null default false
);

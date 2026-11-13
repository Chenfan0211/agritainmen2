create table fulfillment_order (
  id varchar(64) primary key,
  tenant_id varchar(64) not null default 'PLATFORM',
  order_id varchar(64) not null,
  supplier_id varchar(64) not null,
  status varchar(32) not null,
  ship_type varchar(32),
  tracking_no varchar(128),
  driver_id varchar(64),
  created_at timestamp not null,
  updated_at timestamp not null,
  version bigint not null default 0,
  deleted boolean not null default false,
  unique (tenant_id, order_id)
);

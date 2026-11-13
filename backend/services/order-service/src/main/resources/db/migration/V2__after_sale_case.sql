create table after_sale_case (
  id varchar(64) primary key,
  tenant_id varchar(64) not null default 'PLATFORM',
  order_id varchar(64) not null,
  sub_order_id varchar(64),
  buyer_id varchar(64),
  supplier_id varchar(64),
  type varchar(32) not null,
  status varchar(32) not null,
  reason varchar(512),
  amount_cents bigint not null default 0,
  refunded_cents bigint not null default 0,
  return_tracking_no varchar(128),
  created_at timestamp not null,
  updated_at timestamp not null,
  version bigint not null default 0,
  deleted boolean not null default false
);

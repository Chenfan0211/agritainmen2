create table notification_record (
  id varchar(64) primary key,
  tenant_id varchar(64) not null default 'PLATFORM',
  channel varchar(32) not null,
  recipient varchar(128) not null,
  template_code varchar(64) not null,
  payload text,
  status varchar(32) not null,
  retry_count integer not null default 0,
  created_at timestamp not null,
  updated_at timestamp not null,
  version bigint not null default 0,
  deleted boolean not null default false
);

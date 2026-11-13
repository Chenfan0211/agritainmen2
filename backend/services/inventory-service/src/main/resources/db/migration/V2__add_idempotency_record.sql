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
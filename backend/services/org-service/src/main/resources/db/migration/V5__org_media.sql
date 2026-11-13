create table org_media (
  id varchar(64) primary key,
  tenant_id varchar(64) not null,
  purpose varchar(64) not null,
  mime_type varchar(32) not null,
  content longblob not null,
  size_bytes bigint not null,
  created_at timestamp not null
);

alter table auth_session add column access_token_hash varchar(64);
create unique index uk_auth_session_access_token_hash on auth_session (access_token_hash);

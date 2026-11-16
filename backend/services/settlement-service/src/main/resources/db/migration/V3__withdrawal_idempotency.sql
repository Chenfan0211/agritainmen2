alter table settlement_withdrawal add column idempotency_key varchar(128);

create unique index uk_settlement_withdrawal_request
    on settlement_withdrawal(tenant_id, requester_id, idempotency_key);

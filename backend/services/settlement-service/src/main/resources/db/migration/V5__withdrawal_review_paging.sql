create index idx_settlement_withdrawal_review_status
    on settlement_withdrawal(tenant_id, deleted, status, created_at, id);

create index idx_settlement_withdrawal_review_created
    on settlement_withdrawal(tenant_id, deleted, created_at, id);

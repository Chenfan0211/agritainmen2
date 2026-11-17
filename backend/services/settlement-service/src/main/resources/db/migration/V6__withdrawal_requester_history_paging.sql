create index idx_settlement_withdrawal_requester_history
    on settlement_withdrawal(tenant_id, requester_id, deleted, created_at, id);

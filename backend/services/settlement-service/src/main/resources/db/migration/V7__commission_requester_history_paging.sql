create index idx_settlement_commission_beneficiary_history
    on settlement_commission(tenant_id, beneficiary_id, deleted, created_at, id);

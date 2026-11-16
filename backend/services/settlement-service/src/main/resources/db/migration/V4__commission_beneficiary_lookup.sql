create index idx_settlement_commission_beneficiary_status
    on settlement_commission(tenant_id, beneficiary_id, status, deleted);

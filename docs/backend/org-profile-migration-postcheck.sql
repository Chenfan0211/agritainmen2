-- 在 org-service Flyway V4 执行后，对现有 MySQL org 库只读检查。
-- 返回的旧门店尚无完整地址。后台修改时要求运营补全真实地址，
-- 不用 region 猜造门牌，也不自动地理编码。
select id, name, region
from org_farm
where tenant_id = 'PLATFORM' and deleted = false
  and (profile_json is null or json_unquote(json_extract(profile_json, '$.address')) is null
       or json_unquote(json_extract(profile_json, '$.address')) = '');

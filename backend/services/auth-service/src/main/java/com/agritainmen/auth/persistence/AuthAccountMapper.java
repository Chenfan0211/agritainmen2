package com.agritainmen.auth.persistence;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface AuthAccountMapper extends BaseMapper<AuthAccount> {
    @Select("""
        select r.* from auth_role r
        join auth_account_role ar on ar.role_id = r.id
        where ar.account_id = #{accountId} and ar.deleted = false and ar.enabled = true
          and r.deleted = false and r.enabled != false
        order by r.code
        """)
    List<AuthRole> findRoles(String accountId);
}

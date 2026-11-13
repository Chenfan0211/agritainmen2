package com.agritainmen.auth.persistence;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface AuthSessionMapper extends BaseMapper<AuthSession> {
    @Update("""
            update auth_session set revoked_at=current_timestamp,revoked_reason=#{reason},updated_at=current_timestamp,version=version+1
            where id=#{id} and revoked_at is null and expires_at>current_timestamp and deleted=false
            """)
    int revokeIfActive(@Param("id") String id, @Param("reason") String reason);
}

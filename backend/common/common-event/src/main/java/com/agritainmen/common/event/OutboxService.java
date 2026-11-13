package com.agritainmen.common.event;

import com.agritainmen.common.core.Ids;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

public class OutboxService {
    private final OutboxMapper mapper;

    public OutboxService(OutboxMapper mapper) {
        this.mapper = mapper;
    }

    @Transactional
    public String append(String aggregateType, String aggregateId, String eventType, String payload) {
        OutboxRecord record = new OutboxRecord();
        record.setId(Ids.uuid("OUT"));
        record.setAggregateType(aggregateType);
        record.setAggregateId(aggregateId);
        record.setEventType(eventType);
        record.setPayload(payload);
        record.setStatus("PENDING");
        record.setRetryCount(0);
        record.setNextRetryAt(Instant.now());
        mapper.insert(record);
        return record.getId();
    }

    @Transactional
    public void markPublished(String id) {
        OutboxRecord record = mapper.selectById(id);
        if (record == null) return;
        record.setStatus("PUBLISHED");
        record.setPublishedAt(Instant.now());
        mapper.updateById(record);
    }
}

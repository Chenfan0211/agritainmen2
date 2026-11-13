package com.agritainmen.fulfillment.provider;

import com.agritainmen.common.core.Ids;

public class SandboxLogisticsProvider implements LogisticsProvider {
    @Override
    public Shipment createShipment(String orderId, String supplierId, String receiverAddress) {
        return new Shipment("sandbox", "SB" + Ids.business(""), null);
    }
    @Override
    public Tracking query(String trackingNo) {
        return new Tracking(trackingNo, "IN_TRANSIT", "沙箱轨迹：包裹已到达测试分拨中心");
    }
}

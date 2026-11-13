package com.agritainmen.fulfillment.provider;

public interface LogisticsProvider {
    Shipment createShipment(String orderId, String supplierId, String receiverAddress);
    Tracking query(String trackingNo);
    record Shipment(String provider, String trackingNo, String labelUrl) {}
    record Tracking(String trackingNo, String status, String latestEvent) {}
}

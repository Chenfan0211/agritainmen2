package com.agritainmen.fulfillment;

import com.agritainmen.fulfillment.web.FulfillmentController;
import com.agritainmen.fulfillment.web.FulfillmentAccessVerifier;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

@SpringBootTest(properties = "spring.profiles.active=test")
class FulfillmentControllerTest {
    @Autowired
    private FulfillmentController controller;
    @MockitoBean private FulfillmentAccessVerifier accessVerifier;

    @Test
    void fulfillmentMustAcceptBeforeSandboxShipment() {
        when(accessVerifier.verify("Bearer admin")).thenReturn(new FulfillmentAccessVerifier.Identity("admin", "", ""));
        when(accessVerifier.verify("Bearer supplier")).thenReturn(new FulfillmentAccessVerifier.Identity("supplier", "S-1", ""));
        String id = controller.create(new FulfillmentController.CreateRequest("ORDER-1", "S-1"), "Bearer admin").data();
        controller.accept(id, "Bearer supplier");
        var shipped = controller.ship(id, new FulfillmentController.ShipRequest("courier", null, null), "Bearer supplier").data();
        assertEquals("SHIPPED", shipped.get("status"));
        assertTrue(String.valueOf(shipped.get("tracking_no")).startsWith("SB"));
        assertEquals("IN_TRANSIT", controller.tracking(String.valueOf(shipped.get("tracking_no")), "Bearer supplier").data().status());
    }
}

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as trackingPostHandler } from "@/app/api/orders/track/route";
import { updateOrderStatusAction } from "@/app/actions/admin";
import { generateOrderCode, isValidOrderCode } from "@/lib/domain/crypto";
import {
  saveMockOrder,
  resetMockStore,
  type MockStoredOrder,
} from "@/lib/domain/mock-store";
import { resetRateLimits } from "@/lib/rate-limit";
import { resetEnvCache } from "@/lib/env";

describe("Phase 7 Acceptance Tests: Public Order Tracking via Bearer Order Number", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://placeholder.supabase.co";
    resetRateLimits();
    resetMockStore();
    resetEnvCache();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetRateLimits();
    resetMockStore();
    resetEnvCache();
  });

  function createTestOrder(overrides: Partial<MockStoredOrder> = {}): MockStoredOrder {
    const code = overrides.order_code || generateOrderCode();
    const order: MockStoredOrder = {
      id: overrides.id || "order-track-" + Math.random().toString(36).slice(2, 9),
      order_code: code,
      customer_name: "Satyendra Nath Bose",
      customer_email: "satyendra@quantum-robotics.org",
      customer_phone: "+919876543210",
      shipping_address: {
        line1: "Bose Institute of Physics",
        city: "Kolkata",
        state: "West Bengal",
        state_code: "19",
        postal_code: "700009",
        country: "India",
      },
      items: [
        {
          productId: "prod-quantum-actuator",
          sku: "RBF-ACT-Q1",
          name: "Quantum Precision Harmonic Actuator 50:1",
          slug: "harmonic-actuator-50-1",
          unitPricePaise: 4500000,
          quantity: 2,
          taxRateBps: 1800,
          totalPaise: 10620000,
          hsn_code: "84795000",
        },
      ],
      subtotal_paise: 9000000,
      tax_paise: 1620000,
      shipping_paise: 0,
      total_paise: 10620000,
      currency: "INR",
      payment_status: "paid",
      delivery_status: "pending",
      reservation_expires_at: Date.now() + 600000,
      reservation_status: "consumed",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides,
    };
    saveMockOrder(order);
    return order;
  }

  function postTracking(body: unknown, clientIp = "192.168.10.50"): Promise<Response> {
    const req = new NextRequest("http://localhost:3000/api/orders/track", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": clientIp,
      },
      body: JSON.stringify(body),
    });
    return trackingPostHandler(req);
  }

  // Acceptance Criterion 1 & 2: Tracking works with only the order number; no email/phone confirmation required.
  it("tracks order using ONLY the high-entropy order number without requiring email, phone, or login", async () => {
    const order = createTestOrder();

    // Look up order supplying strictly orderCode
    const res = await postTracking({ orderCode: order.order_code });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.order).toBeDefined();
    expect(json.order.order_code).toBe(order.order_code);
    expect(json.order.delivery_status).toBe("pending");
    expect(json.order.currency).toBe("INR");
    expect(json.order.total_paise).toBe(10620000);
    expect(json.order.items).toHaveLength(1);
    expect(json.order.items[0].product_name).toBe("Quantum Precision Harmonic Actuator 50:1");
    expect(json.order.items[0].quantity).toBe(2);
  });

  // Acceptance Criterion 3: Random codes are not guessable from neighboring order numbers.
  it("generates 128-bit cryptographically unpredictable tokens that cannot be guessed from neighboring orders", () => {
    const code1 = generateOrderCode();
    const code2 = generateOrderCode();
    const code3 = generateOrderCode();

    expect(isValidOrderCode(code1)).toBe(true);
    expect(isValidOrderCode(code2)).toBe(true);
    expect(isValidOrderCode(code3)).toBe(true);

    expect(code1).not.toBe(code2);
    expect(code2).not.toBe(code3);

    // Verify segments are un-sequential (32 random hex chars in 4 blocks)
    const segments1 = code1.split("-").slice(1);
    const segments2 = code2.split("-").slice(1);

    expect(segments1).toHaveLength(4);
    expect(segments2).toHaveLength(4);

    // Each block must have 8 uppercase hex characters
    for (const seg of segments1) {
      expect(seg).toMatch(/^[0-9A-F]{8}$/);
    }

    // High Hamming distance: consecutive orders do not share prefixes or incrementing counters
    let differingBlocks = 0;
    for (let i = 0; i < 4; i++) {
      if (segments1[i] !== segments2[i]) differingBlocks++;
    }
    expect(differingBlocks).toBe(4);
  });

  // Acceptance Criterion 4: PII is never returned in the tracking API.
  it("strictly omits all customer PII, street addresses, and payment secrets from response payload", async () => {
    const order = createTestOrder({
      customer_name: "CONFIDENTIAL USER",
      customer_email: "secret@example.com",
      customer_phone: "+919999999999",
      shipping_address: {
        line1: "SECRET STREET 123",
        city: "Classified",
        state: "Karnataka",
        postal_code: "560001",
      },
    });

    const res = await postTracking({ orderCode: order.order_code });
    expect(res.status).toBe(200);

    const json = await res.json();
    const data = json.order;

    // Allowed minimal fields
    expect(data.order_code).toBe(order.order_code);
    expect(data.delivery_status).toBe("pending");
    expect(data.payment_status).toBe("paid");
    expect(data.created_at).toBe(order.created_at);
    expect(data.items).toBeDefined();

    // Strictly forbidden PII keys
    const forbiddenProps = [
      "customer_name",
      "customer_email",
      "customer_phone",
      "shipping_address",
      "shippingAddress",
      "address",
      "line1",
      "line2",
      "city",
      "state",
      "postal_code",
      "name",
      "email",
      "phone",
      "id",
      "user_id",
      "customer_id",
      "razorpay_order_id",
      "razorpay_payment_id",
    ];

    for (const prop of forbiddenProps) {
      expect(data).not.toHaveProperty(prop);
    }

    // Verify stringified response contains zero customer identity strings
    const rawString = JSON.stringify(json);
    expect(rawString).not.toContain("CONFIDENTIAL USER");
    expect(rawString).not.toContain("secret@example.com");
    expect(rawString).not.toContain("+919999999999");
    expect(rawString).not.toContain("SECRET STREET 123");
  });

  // Acceptance Criterion 5: Invalid code, rate limiting and repeated attempts are tested.
  describe("Security Controls: Indistinguishable Errors & Rate Limiting", () => {
    it("ensures invalid format codes and nonexistent codes return indistinguishable generic error messages", async () => {
      // 1. Invalid format
      const invalidRes = await postTracking({ orderCode: "INVALID-CODE-123" });
      expect(invalidRes.status).toBe(404);
      const invalidJson = await invalidRes.json();

      // 2. Nonexistent valid-format code
      const nonexistentCode = "RBF-FFFFFFFF-00000000-11111111-22222222";
      const nonexistentRes = await postTracking({ orderCode: nonexistentCode });
      expect(nonexistentRes.status).toBe(404);
      const nonexistentJson = await nonexistentRes.json();

      // Indistinguishable response: Attackers cannot enumerate valid vs invalid formats
      expect(invalidJson.error).toBe(nonexistentJson.error);
      expect(invalidJson.error).toBe("Order not found. Check your tracking key and try again.");
    });

    it("enforces sliding window rate limit of 15 requests per minute with no-store headers", async () => {
      const order = createTestOrder();
      const clientIp = "192.168.88.99";

      // 15 allowed attempts
      for (let i = 0; i < 15; i++) {
        const res = await postTracking({ orderCode: order.order_code }, clientIp);
        expect(res.status).toBe(200);
      }

      // 16th attempt must be blocked (429)
      const blockedRes = await postTracking({ orderCode: order.order_code }, clientIp);
      expect(blockedRes.status).toBe(429);
      const blockedJson = await blockedRes.json();
      expect(blockedJson.error).toMatch(/Too many tracking requests/);
      expect(blockedRes.headers.get("cache-control")).toContain("no-store");
      expect(blockedRes.headers.get("referrer-policy")).toBe("no-referrer");
    });
  });

  // Acceptance Criterion 6: Tracking history updates when the admin changes delivery status.
  it("updates tracking timeline history immediately when admin changes delivery status", async () => {
    const order = createTestOrder({
      id: "admin-order-lifecycle-test-01",
      delivery_status: "pending",
    });

    // 1. Initial State: pending
    const initialRes = await postTracking({ orderCode: order.order_code });
    const initialData = (await initialRes.json()).order;
    expect(initialData.delivery_status).toBe("pending");
    expect(initialData.status_history).toHaveLength(1);
    expect(initialData.status_history[0].status).toBe("pending");

    // 2. Admin advances order to 'processing'
    const adminUpdate1 = await updateOrderStatusAction(order.id, "processing");
    expect(adminUpdate1.success).toBe(true);

    const postProcessingRes = await postTracking({ orderCode: order.order_code });
    const postProcessingData = (await postProcessingRes.json()).order;
    expect(postProcessingData.delivery_status).toBe("processing");
    expect(postProcessingData.status_history).toHaveLength(2);
    expect(postProcessingData.status_history[1].status).toBe("processing");

    // 3. Admin advances order to 'shipped'
    const adminUpdate2 = await updateOrderStatusAction(order.id, "shipped");
    expect(adminUpdate2.success).toBe(true);

    const postShippedRes = await postTracking({ orderCode: order.order_code });
    const postShippedData = (await postShippedRes.json()).order;
    expect(postShippedData.delivery_status).toBe("shipped");
    expect(postShippedData.status_history).toHaveLength(3);
    expect(postShippedData.status_history[2].status).toBe("shipped");

    // 4. Admin advances order to 'delivered'
    const adminUpdate3 = await updateOrderStatusAction(order.id, "delivered");
    expect(adminUpdate3.success).toBe(true);

    const postDeliveredRes = await postTracking({ orderCode: order.order_code });
    const postDeliveredData = (await postDeliveredRes.json()).order;
    expect(postDeliveredData.delivery_status).toBe("delivered");
    expect(postDeliveredData.status_history).toHaveLength(4);
    expect(postDeliveredData.status_history[3].status).toBe("delivered");

    // Verify all history entries have valid ISO timestamps and non-empty status labels
    for (const entry of postDeliveredData.status_history) {
      expect(entry.status).toBeDefined();
      expect(new Date(entry.timestamp).getTime()).not.toBeNaN();
    }
  });

  it("handles cancelled delivery state clearly without inventing estimated delivery dates", async () => {
    const order = createTestOrder({
      id: "admin-order-cancel-test-01",
      delivery_status: "pending",
    });

    const adminCancel = await updateOrderStatusAction(order.id, "cancelled");
    expect(adminCancel.success).toBe(true);

    const cancelRes = await postTracking({ orderCode: order.order_code });
    const cancelData = (await cancelRes.json()).order;

    expect(cancelData.delivery_status).toBe("cancelled");
    expect(cancelData.status_history[cancelData.status_history.length - 1].status).toBe("cancelled");

    // Strictly ensure no invented estimated dates exist in response
    const jsonString = JSON.stringify(cancelData);
    expect(jsonString).not.toContain("estimated_delivery");
    expect(jsonString).not.toContain("estimatedDelivery");
    expect(jsonString).not.toContain("eta");
  });
});

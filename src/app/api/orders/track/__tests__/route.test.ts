import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST, GET } from "../route";
import { resetRateLimits } from "@/lib/rate-limit";

describe("Order Tracking API Route Handler (/api/orders/track)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://placeholder.supabase.co";
    resetRateLimits();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetRateLimits();
  });

  function createTrackingPostRequest(body: unknown, clientIp = "192.168.1.100"): NextRequest {
    return new NextRequest("http://localhost:3000/api/orders/track", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": clientIp,
      },
      body: JSON.stringify(body),
    });
  }

  it("strictly rejects GET requests with 405 Method Not Allowed and no-store / no-referrer headers", async () => {
    const res = await GET();
    expect(res.status).toBe(405);
    const json = await res.json();
    expect(json.error).toMatch(/Method not allowed/);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("returns indistinguishable generic error for non-JSON or malformed request bodies", async () => {
    const req = new NextRequest("http://localhost:3000/api/orders/track", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "192.168.1.101",
      },
      body: "not-json-content",
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Order not found. Check your tracking key and try again.");
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("ensures invalid format codes and nonexistent codes return indistinguishable generic error messages", async () => {
    const invalidOrNonexistentCodes = [
      "ORD-123",
      "12345",
      "RBF-123",
      "RBF-abcdefgh-12345678-ijklmnop-qrstuvwx", // lowercase
      "RBF-12345678-12345678-12345678",          // 3 segments
      "RBF-00000000-00000000-00000000-00000000", // valid format but nonexistent
    ];

    for (const code of invalidOrNonexistentCodes) {
      const req = createTrackingPostRequest({ orderCode: code });
      const res = await POST(req);
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe("Order not found. Check your tracking key and try again.");
    }
  });

  it("returns tracking data with no-store and no-referrer headers for valid 128-bit cryptographic code", async () => {
    const validCode = "RBF-A1B2C3D4-E5F67890-12345678-90ABCDEF";
    const req = createTrackingPostRequest({ orderCode: validCode });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.order).toBeDefined();
    expect(json.order.order_code).toBe(validCode);
    expect(json.order.currency).toBe("INR");
    expect(typeof json.order.total_paise).toBe("number");
    expect(Array.isArray(json.order.items)).toBe(true);
    expect(Array.isArray(json.order.status_history)).toBe(true);
  });

  it("strictly enforces ZERO-PII in response payload", async () => {
    const validCode = "RBF-99887766-55443322-1100FFEE-DDAABB99";
    const req = createTrackingPostRequest({ orderCode: validCode });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    const order = json.order;

    // Allowed minimal fields
    expect(order).toHaveProperty("order_code");
    expect(order).toHaveProperty("created_at");
    expect(order).toHaveProperty("payment_status");
    expect(order).toHaveProperty("delivery_status");
    expect(order).toHaveProperty("total_paise");
    expect(order).toHaveProperty("currency");
    expect(order).toHaveProperty("status_history");
    expect(order).toHaveProperty("items");

    // Strictly forbidden PII properties (never return customer identity, phone, email, address, or payment secrets)
    const forbiddenKeys = [
      "name",
      "customer_name",
      "email",
      "customer_email",
      "phone",
      "customer_phone",
      "shipping_address",
      "shippingAddress",
      "address",
      "line1",
      "line2",
      "city",
      "state",
      "postal_code",
      "user_id",
      "customer_id",
      "id",
      "razorpay_order_id",
      "razorpay_payment_id",
      "notes",
    ];

    for (const key of forbiddenKeys) {
      expect(order).not.toHaveProperty(key);
    }
  });

  it("enforces IP sliding window rate limit of 15 requests per minute", async () => {
    const clientIp = "10.42.42.42";
    const validCode = "RBF-A1B2C3D4-E5F67890-12345678-90ABCDEF";

    // Exhaust limit (15 requests allowed)
    for (let i = 0; i < 15; i++) {
      const req = createTrackingPostRequest({ orderCode: validCode }, clientIp);
      const res = await POST(req);
      expect(res.status).toBe(200);
    }

    // 16th request must be rate limited (429)
    const blockedReq = createTrackingPostRequest({ orderCode: validCode }, clientIp);
    const blockedRes = await POST(blockedReq);
    expect(blockedRes.status).toBe(429);
    const json = await blockedRes.json();
    expect(json.error).toMatch(/Too many tracking requests/);
    expect(blockedRes.headers.get("cache-control")).toContain("no-store");
  });
});

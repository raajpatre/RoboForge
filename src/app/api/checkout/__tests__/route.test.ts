import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST, GET } from "../route";
import { FALLBACK_DEMO_PRODUCTS } from "@/lib/catalog";
import { resetRateLimits } from "@/lib/rate-limit";

describe("/api/checkout Route Handler", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.PAYMENT_MODE = "test";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://placeholder.supabase.co";
    process.env.SELLER_TAX_MODE = "gst_registered";
    process.env.SELLER_GSTIN = "29AABCR1234F1Z5";
    resetRateLimits();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetRateLimits();
  });

  const validPayload = {
    customer: {
      name: "Dr. Ananya Roy",
      email: "ananya@robotics-institute.org",
      phone: "+919876543210",
      shippingAddress: {
        line1: "Autonomous Systems Lab, Innovation Hub",
        city: "Pune",
        state: "Maharashtra",
        postal_code: "411007",
        country: "India",
      },
    },
    items: [
      {
        productId: FALLBACK_DEMO_PRODUCTS[0].id,
        quantity: 1,
      },
    ],
  };

  it("successfully initiates checkout session accepting product IDs and quantities only", async () => {
    const req = new NextRequest("http://localhost:3000/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validPayload),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.orderCode).toBeDefined();
    // 128-bit cryptographic order code
    expect(json.orderCode).toMatch(/^RBF-[0-9A-F]{8}-[0-9A-F]{8}-[0-9A-F]{8}-[0-9A-F]{8}$/);
    expect(json.razorpayOrderId).toBeDefined();
    expect(json.currency).toBe("INR");
    expect(json.amountPaise).toBeGreaterThan(0);
  });

  it("rejects client attempts to submit prices or fraudulent totals", async () => {
    // Client attempts to sneak in client-side price
    const maliciousPayload = {
      ...validPayload,
      items: [
        {
          productId: FALLBACK_DEMO_PRODUCTS[0].id,
          quantity: 1,
          price_paise: 100, // Attempted price override to ₹1
        },
      ],
    };

    const req = new NextRequest("http://localhost:3000/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(maliciousPayload),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    // Server computes true authoritative total: ₹1,85,000 + 18% GST = ₹2,18,300 (21830000 paise)
    expect(json.amountPaise).toBe(21830000);
    expect(json.amountPaise).not.toBe(100);
  });

  it("rejects invalid request body format", async () => {
    const req = new NextRequest("http://localhost:3000/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it("rejects missing customer details", async () => {
    const req = new NextRequest("http://localhost:3000/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        items: [{ productId: FALLBACK_DEMO_PRODUCTS[0].id, quantity: 1 }],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it("rejects GET requests with 405 Method Not Allowed", async () => {
    const res = await GET();
    expect(res.status).toBe(405);
  });
});

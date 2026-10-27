import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import crypto from "node:crypto";
import { POST } from "../route";

describe("Razorpay Webhook API Route Handler", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.PAYMENT_MODE = "test";
    process.env.RAZORPAY_WEBHOOK_SECRET = "test_webhook_secret_key";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://placeholder.supabase.co";
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function createSignedRequest(body: object, secret = "test_webhook_secret_key"): NextRequest {
    const rawBody = JSON.stringify(body);
    const signature = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");

    return new NextRequest("http://localhost:3000/api/webhooks/razorpay", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-razorpay-signature": signature,
      },
      body: rawBody,
    });
  }

  it("rejects unsigned requests with 400 Bad Request", async () => {
    const req = new NextRequest("http://localhost:3000/api/webhooks/razorpay", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: "payment.captured" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/Invalid webhook cryptographic signature/);
  });

  it("rejects forged or tampered webhook signatures", async () => {
    const req = createSignedRequest(
      { event: "payment.captured", amount: 1000 },
      "wrong_secret_key"
    );

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/Invalid webhook cryptographic signature/);
  });

  it("accepts authentic signed webhook events in test mode", async () => {
    const req = createSignedRequest({
      entity: "event",
      account_id: "acc_test",
      event: "payment.captured",
      contains: ["payment"],
      payload: {
        payment: {
          entity: {
            id: "pay_test_12345",
            order_id: "order_test_12345",
            amount: 21830000,
            currency: "INR",
            status: "captured",
            method: "upi",
            notes: { order_code: "RBF-11111111-22222222-33333333-44444444" },
          },
        },
      },
      created_at: Math.floor(Date.now() / 1000),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

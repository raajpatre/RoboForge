import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { POST, GET } from "../route";

describe("/api/payment/callback Route Handler", () => {
  it("redirects GET requests to the tracking page when orderCode is provided", async () => {
    const req = new NextRequest("http://localhost:3000/api/payment/callback?orderCode=RBF-TEST-1234");
    const res = await GET(req);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("/track?code=RBF-TEST-1234&confirmed=true");
  });

  it("redirects GET requests without orderCode to the cart page", async () => {
    const req = new NextRequest("http://localhost:3000/api/payment/callback");
    const res = await GET(req);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("/cart");
  });

  it("handles POST callback with orderCode and redirects to tracking", async () => {
    const formData = new FormData();
    formData.append("razorpay_payment_id", "pay_test_123");
    formData.append("razorpay_order_id", "order_test_456");
    formData.append("razorpay_signature", "mock_signature_test");

    const req = new NextRequest("http://localhost:3000/api/payment/callback?orderCode=RBF-TEST-1234", {
      method: "POST",
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("/track?code=RBF-TEST-1234&confirmed=true");
  });
});

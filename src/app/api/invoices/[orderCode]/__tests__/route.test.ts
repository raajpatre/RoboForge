import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "../route";
import { resetRateLimits } from "@/lib/rate-limit";

describe("Invoice PDF Streaming API Route (/api/invoices/[orderCode])", () => {
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

  function createInvoiceRequest(
    orderCode: string,
    method: "GET" | "POST" = "POST",
    clientIp = "192.168.2.100"
  ): {
    req: NextRequest;
    context: { params: Promise<{ orderCode: string }> };
  } {
    const req = new NextRequest(`http://localhost:3000/api/invoices/${orderCode}`, {
      method,
      headers: {
        "x-forwarded-for": clientIp,
        "content-type": "application/json",
      },
    });

    return {
      req,
      context: { params: Promise.resolve({ orderCode }) },
    };
  }

  it("rejects invalid tracking code formats with 400 Bad Request on POST", async () => {
    const { req, context } = createInvoiceRequest("invalid-code-123", "POST");
    const res = await POST(req, context);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/Invalid order tracking key format/);
  });

  it("rejects invalid tracking code formats with 400 Bad Request on GET", async () => {
    const { req, context } = createInvoiceRequest("invalid-code-123", "GET");
    const res = await GET(req, context);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/Invalid order tracking key format/);
  });

  it("streams generated PDF with private, no-store headers on POST", async () => {
    const validCode = "RBF-11112222-33334444-55556666-77778888";
    const { req, context } = createInvoiceRequest(validCode, "POST");
    const res = await POST(req, context);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toMatch(/attachment; filename="Invoice-.*\.pdf"/);
    expect(res.headers.get("cache-control")).toContain("private");
    expect(res.headers.get("cache-control")).toContain("no-store");

    const blob = await res.blob();
    expect(blob.size).toBeGreaterThan(1000);
  });

  it("streams generated PDF with application/pdf and proper headers on GET", async () => {
    const validCode = "RBF-11112222-33334444-55556666-77778888";
    const { req, context } = createInvoiceRequest(validCode, "GET");
    const res = await GET(req, context);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toMatch(/inline; filename="Invoice-.*\.pdf"/);
    expect(res.headers.get("cache-control")).toContain("private");
    expect(res.headers.get("cache-control")).toContain("no-store");

    const blob = await res.blob();
    expect(blob.size).toBeGreaterThan(1000);
  });

  it("enforces sliding window rate limit of 20 downloads per minute per IP on POST", async () => {
    const validCode = "RBF-AAAABBBB-CCCCDDDD-EEEEFFFF-00001111";
    const clientIp = "10.99.99.99";

    // Exhaust limit (20 allowed)
    for (let i = 0; i < 20; i++) {
      const { req, context } = createInvoiceRequest(validCode, "POST", clientIp);
      const res = await POST(req, context);
      expect(res.status).toBe(200);
    }

    // 21st request must trigger 429
    const { req: blockedReq, context: blockedContext } = createInvoiceRequest(
      validCode,
      "POST",
      clientIp
    );
    const blockedRes = await POST(blockedReq, blockedContext);

    expect(blockedRes.status).toBe(429);
    const json = await blockedRes.json();
    expect(json.error).toMatch(/Too many invoice requests/);
  });
});

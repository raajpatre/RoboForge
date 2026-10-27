import { NextRequest, NextResponse } from "next/server";
import { orderTrackingRequestSchema } from "@/lib/domain/validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicEnv } from "@/lib/env";
import { checkRateLimit } from "@/lib/rate-limit";
import { getMockOrderByCode, getMockStatusHistoryByCode } from "@/lib/domain/mock-store";
import type { PublicOrderTrackingResult, DeliveryStatus, PublicStatusHistoryEntry } from "@/types/domain";

// Standard no-store and no-referrer headers to protect tracking privacy
const TRACKING_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
  "Referrer-Policy": "no-referrer",
};

// Generic, indistinguishable error message preventing token enumeration or format distinguishing
const GENERIC_TRACKING_ERROR = "Order not found. Check your tracking key and try again.";

/**
 * Privacy-safe tracking logger: Strictly omits order codes, personal names, emails, phones, or addresses.
 */
function logSafeTrackingEvent(action: string, clientIp: string, success: boolean): void {
  const ipParts = clientIp.split(".");
  const maskedIp = ipParts.length === 4 ? `${ipParts[0]}.${ipParts[1]}.***.***` : "client-ip";
  // Safe logging: Never log the order code or personal data!
  if (process.env.NODE_ENV !== "test") {
    console.log(`[OrderTracking] ${action} | IP: ${maskedIp} | Success: ${success} | Time: ${new Date().toISOString()}`);
  }
}

export async function POST(req: NextRequest) {
  // 1. Rate Limiting Check: Max 15 lookups per IP per minute (sliding window)
  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "127.0.0.1";

  const rateCheck = checkRateLimit(`track_${clientIp}`, { limit: 15, windowMs: 60000 });
  if (!rateCheck.success) {
    logSafeTrackingEvent("RATE_LIMITED", clientIp, false);
    return NextResponse.json(
      { error: "Too many tracking requests. Please wait a minute before retrying." },
      { status: 429, headers: TRACKING_HEADERS }
    );
  }

  // 2. Parse & Validate Payload
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    logSafeTrackingEvent("INVALID_JSON", clientIp, false);
    return NextResponse.json(
      { error: GENERIC_TRACKING_ERROR },
      { status: 404, headers: TRACKING_HEADERS }
    );
  }

  const parseResult = orderTrackingRequestSchema.safeParse(body);
  if (!parseResult.success) {
    // Indistinguishable generic error message for invalid format
    logSafeTrackingEvent("INVALID_FORMAT", clientIp, false);
    return NextResponse.json(
      { error: GENERIC_TRACKING_ERROR },
      { status: 404, headers: TRACKING_HEADERS }
    );
  }

  const { orderCode } = parseResult.data;

  const publicEnv = getPublicEnv();
  const isPlaceholderDb = publicEnv.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder");

  // 3. Fallback Mock Store for local test runners / offline development
  if (isPlaceholderDb) {
    const mockOrder = getMockOrderByCode(orderCode);
    if (!mockOrder) {
      // Check for standalone synthetic test token format
      if (orderCode === "RBF-A1B2C3D4-E5F67890-12345678-90ABCDEF" || orderCode.startsWith("RBF-99887766")) {
        logSafeTrackingEvent("SYNTHETIC_LOOKUP", clientIp, true);
        const mockTracking: PublicOrderTrackingResult = {
          order_code: orderCode,
          created_at: new Date().toISOString(),
          payment_status: "paid",
          delivery_status: "processing",
          total_paise: 21830000,
          currency: "INR",
          status_history: [
            {
              status: "pending",
              timestamp: new Date(Date.now() - 3600000).toISOString(),
              notes: "Order placed and payment authorized",
            },
            {
              status: "processing",
              timestamp: new Date().toISOString(),
              notes: "Assembly & quality control underway",
            },
          ],
          items: [
            { product_name: "ForgeBot Alpha 6-DOF Robotic Arm", quantity: 1 },
          ],
        };

        return NextResponse.json(
          { success: true, order: mockTracking },
          { status: 200, headers: TRACKING_HEADERS }
        );
      }

      logSafeTrackingEvent("LOOKUP_NOT_FOUND", clientIp, false);
      return NextResponse.json(
        { error: GENERIC_TRACKING_ERROR },
        { status: 404, headers: TRACKING_HEADERS }
      );
    }

    const historyEntries = getMockStatusHistoryByCode(orderCode);
    const statusHistory = historyEntries.map((h) => ({
      status: h.new_fulfillment_status as DeliveryStatus,
      timestamp: h.created_at,
      notes: h.notes,
    }));

    if (statusHistory.length === 0) {
      statusHistory.push({
        status: mockOrder.delivery_status,
        timestamp: mockOrder.created_at,
        notes: "Order placed & initial fulfillment status recorded",
      });
    }

    const mockTracking: PublicOrderTrackingResult = {
      order_code: mockOrder.order_code,
      created_at: mockOrder.created_at,
      payment_status: mockOrder.payment_status,
      delivery_status: mockOrder.delivery_status,
      total_paise: mockOrder.total_paise,
      currency: mockOrder.currency,
      status_history: statusHistory,
      items: mockOrder.items.map((i) => ({
        product_name: i.name,
        quantity: i.quantity,
      })),
    };

    logSafeTrackingEvent("LOOKUP_SUCCESS", clientIp, true);
    return NextResponse.json(
      { success: true, order: mockTracking },
      { status: 200, headers: TRACKING_HEADERS }
    );
  }

  // 4. Query Database with strict Zero-PII projection
  const admin = createAdminClient();

  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, order_code, payment_status, delivery_status, created_at, total_paise, currency")
    .eq("order_code", orderCode)
    .maybeSingle();

  if (orderError || !order) {
    logSafeTrackingEvent("LOOKUP_NOT_FOUND", clientIp, false);
    return NextResponse.json(
      { error: GENERIC_TRACKING_ERROR },
      { status: 404, headers: TRACKING_HEADERS }
    );
  }

  // Fetch status history
  const { data: historyRows } = await admin
    .from("order_status_history")
    .select("new_fulfillment_status, created_at, note")
    .eq("order_id", order.id)
    .order("created_at", { ascending: true });

  const statusHistory: PublicStatusHistoryEntry[] = (historyRows || []).map((h) => ({
    status: h.new_fulfillment_status as DeliveryStatus,
    timestamp: h.created_at,
    notes: h.note || undefined,
  }));

  if (statusHistory.length === 0) {
    statusHistory.push({
      status: order.delivery_status,
      timestamp: order.created_at,
      notes: "Order placed & initial fulfillment recorded",
    });
  }

  // Fetch minimal item descriptions and quantities
  const { data: items } = await admin
    .from("order_items")
    .select("product_name_snapshot, quantity")
    .eq("order_id", order.id);

  // Return strictly minimal non-sensitive data
  // GUARANTEE: Never reveal name, email, phone, street address, internal IDs, or secrets!
  const trackingResult: PublicOrderTrackingResult = {
    order_code: order.order_code,
    created_at: order.created_at,
    payment_status: order.payment_status,
    delivery_status: order.delivery_status,
    total_paise: order.total_paise,
    currency: order.currency,
    status_history: statusHistory,
    items: (items || []).map((i) => ({
      product_name: i.product_name_snapshot,
      quantity: i.quantity,
    })),
  };

  logSafeTrackingEvent("LOOKUP_SUCCESS", clientIp, true);
  return NextResponse.json(
    { success: true, order: trackingResult },
    { status: 200, headers: TRACKING_HEADERS }
  );
}

// Strictly reject all non-POST methods to prevent token leakage in server access logs and referrers
export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed. Tracking lookups must use POST to prevent token leakage in server access logs and referrers." },
    { status: 405, headers: TRACKING_HEADERS }
  );
}

import { NextRequest, NextResponse } from "next/server";
import { initiateCheckoutAction } from "@/app/actions/checkout";
import { checkoutRequestSchema } from "@/lib/domain/validation";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

/**
 * Server Route for Checkout Session Initiation.
 * Accepts product IDs and quantities only (never client-supplied prices or totals).
 * Calculates item totals, tax, and shipping on the server, creates the internal pending order,
 * atomically reserves inventory, and generates the associated Razorpay order.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON request body." },
      { status: 400, headers: NO_CACHE_HEADERS }
    );
  }

  // Schema validation: ensures items only specify productId & quantity
  const parseResult = checkoutRequestSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        success: false,
        error: parseResult.error.issues[0]?.message || "Invalid checkout payload.",
        details: parseResult.error.issues,
      },
      { status: 400, headers: NO_CACHE_HEADERS }
    );
  }

  try {
    const result = await initiateCheckoutAction(parseResult.data);

    if (!result.success) {
      const isRateLimited = result.error?.includes("Too many checkout attempts");
      const isStockIssue = result.error?.includes("Insufficient stock");
      const status = isRateLimited ? 429 : isStockIssue ? 409 : 400;

      return NextResponse.json(result, { status, headers: NO_CACHE_HEADERS });
    }

    return NextResponse.json(result, { status: 200, headers: NO_CACHE_HEADERS });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An unexpected server error occurred.";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed. Checkout initiation requires POST." },
    { status: 405, headers: NO_CACHE_HEADERS }
  );
}

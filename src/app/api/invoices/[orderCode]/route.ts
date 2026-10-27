import { NextRequest, NextResponse } from "next/server";
import { orderCodeSchema } from "@/lib/domain/validation";
import { checkRateLimit } from "@/lib/rate-limit";
import { getOrCreateInvoiceSnapshot } from "@/lib/domain/invoice";
import { generateInvoicePdf } from "@/lib/pdf/invoice-generator";

interface RouteContext {
  params: Promise<{
    orderCode: string;
  }>;
}

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

/**
 * Customer Invoice PDF Endpoint - POST-based Retrieval.
 * Protected by the customer's high-entropy (>= 128-bit) secret order possession token.
 * Rate limited to 20 requests per minute per IP.
 * Returns private, no-store responses.
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  // 1. Rate Limiting Check
  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "127.0.0.1";

  const rateCheck = checkRateLimit(`invoice_${clientIp}`, {
    limit: 20,
    windowMs: 60000,
  });

  if (!rateCheck.success) {
    return NextResponse.json(
      { error: "Too many invoice requests. Please wait a minute before retrying." },
      { status: 429, headers: NO_STORE_HEADERS }
    );
  }

  // 2. Validate Order Code (from params or body)
  const resolvedParams = await params;
  let rawCode = resolvedParams.orderCode;

  try {
    const body = await req.json().catch(() => null);
    if (body?.orderCode) {
      rawCode = body.orderCode;
    }
  } catch {
    // Body parsing optional if param is supplied
  }

  const parseResult = orderCodeSchema.safeParse(rawCode);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        error:
          "Invalid order tracking key format. Expected 128-bit key: RBF-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX",
      },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const orderCode = parseResult.data;

  try {
    // 3. Fetch or Idempotently Create Invoice Snapshot (Zero PDF Bytes stored in DB)
    const snapshot = await getOrCreateInvoiceSnapshot(orderCode);

    if (!snapshot) {
      return NextResponse.json(
        {
          error:
            "Invoice not available. Either no order matches this key or the order is awaiting payment capture.",
        },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    // 4. Stream Generated PDF Vector Bytes on Demand
    const pdfBytes = await generateInvoicePdf(snapshot);

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Invoice-${snapshot.invoice_number}.pdf"`,
        "Content-Length": String(pdfBytes.byteLength),
        ...NO_STORE_HEADERS,
      },
    });
  } catch (err: unknown) {
    console.error("Invoice generation error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "An unexpected error occurred while generating the invoice.",
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

/**
 * Customer Invoice PDF Endpoint - GET (for direct browser tab viewing)
 */
export async function GET(req: NextRequest, { params }: RouteContext) {
  // 1. Rate Limiting Check
  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "127.0.0.1";

  const rateCheck = checkRateLimit(`invoice_${clientIp}`, {
    limit: 20,
    windowMs: 60000,
  });

  if (!rateCheck.success) {
    return NextResponse.json(
      { error: "Too many invoice requests. Please wait a minute before retrying." },
      { status: 429, headers: NO_STORE_HEADERS }
    );
  }

  // 2. Validate Order Code Parameter
  const resolvedParams = await params;
  const rawCode = resolvedParams.orderCode;

  const parseResult = orderCodeSchema.safeParse(rawCode);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        error:
          "Invalid order tracking key format. Expected 128-bit key: RBF-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX",
      },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const orderCode = parseResult.data;

  try {
    const snapshot = await getOrCreateInvoiceSnapshot(orderCode);

    if (!snapshot) {
      return NextResponse.json(
        {
          error:
            "Invoice not available. Either no order matches this key or the order is awaiting payment capture.",
        },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const pdfBytes = await generateInvoicePdf(snapshot);

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="Invoice-${snapshot.invoice_number}.pdf"`,
        "Content-Length": String(pdfBytes.byteLength),
        ...NO_STORE_HEADERS,
      },
    });
  } catch (err: unknown) {
    console.error("Invoice generation error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "An unexpected error occurred while generating the invoice.",
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

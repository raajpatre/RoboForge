import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth/admin-guard";
import { getInvoicePdfByOrderId } from "@/lib/domain/invoice";

export const dynamic = "force-dynamic";

/**
 * Admin API Route: Generates or fetches tax invoice PDF by internal order UUID.
 * Strictly protected: requires active administrative authentication.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminUser();
  } catch {
    return NextResponse.json(
      { error: "Unauthorized access: Administrative authentication required." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  const { id } = await params;

  if (!id) {
    return NextResponse.json(
      { error: "Missing required order ID." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const result = await getInvoicePdfByOrderId(id);

    if (!result) {
      return NextResponse.json(
        { error: "Tax invoice could not be located or generated for this order." },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }

    const { pdfBytes, invoice } = result;
    const filename = `tax-invoice-${invoice.invoice_number || id}.pdf`;

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-RoboShop-Invoice-Number": invoice.invoice_number,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error generating invoice PDF.";
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

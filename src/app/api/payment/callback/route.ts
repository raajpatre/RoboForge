import { NextRequest, NextResponse } from "next/server";
import { verifyPaymentAction } from "@/app/actions/payment";

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const orderCodeFromQuery = url.searchParams.get("orderCode") || "";

    // Razorpay POSTs application/x-www-form-urlencoded form data
    const formData = await req.formData().catch(() => null);
    const paymentId = formData?.get("razorpay_payment_id")?.toString() || "";
    const razorpayOrderId = formData?.get("razorpay_order_id")?.toString() || "";
    const signature = formData?.get("razorpay_signature")?.toString() || "";

    if (orderCodeFromQuery && paymentId && signature) {
      await verifyPaymentAction({
        orderCode: orderCodeFromQuery,
        razorpayOrderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: signature,
      }).catch((err) => {
        console.error("Callback verifyPaymentAction error:", err);
      });

      return NextResponse.redirect(
        new URL(`/track?code=${encodeURIComponent(orderCodeFromQuery)}&confirmed=true`, req.url),
        303
      );
    }

    if (orderCodeFromQuery) {
      return NextResponse.redirect(
        new URL(`/track?code=${encodeURIComponent(orderCodeFromQuery)}&confirmed=true`, req.url),
        303
      );
    }

    return NextResponse.redirect(new URL("/cart", req.url), 303);
  } catch (err) {
    console.error("Payment callback error:", err);
    return NextResponse.redirect(new URL("/cart", req.url), 303);
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const orderCode = url.searchParams.get("orderCode");
  if (orderCode) {
    return NextResponse.redirect(
      new URL(`/track?code=${encodeURIComponent(orderCode)}&confirmed=true`, req.url),
      303
    );
  }
  return NextResponse.redirect(new URL("/cart", req.url), 303);
}

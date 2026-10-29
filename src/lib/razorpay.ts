import "server-only";
import crypto from "node:crypto";
import Razorpay from "razorpay";
import { getServerEnv, isLivePaymentMode } from "@/lib/env";

if (typeof window !== "undefined") {
  throw new Error("Razorpay operations must only be executed on the server.");
}

export interface CreateOrderParams {
  amountPaise: number;
  currency?: string;
  receipt: string;
  notes?: Record<string, string>;
}

export interface RazorpayOrderResult {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  status: string;
}

export interface VerifyPaymentParams {
  orderId: string;
  paymentId: string;
  signature: string;
}

export interface RazorpayPaymentDetails {
  id: string;
  order_id: string;
  status: "captured" | "failed" | "authorized" | "refunded";
  amount: number;
  currency: string;
  method?: string;
  error_code?: string | null;
  error_description?: string | null;
}

let razorpayClientInstance: Razorpay | null = null;

export function resetRazorpayClientInstance(): void {
  razorpayClientInstance = null;
}

export function getRazorpayClient(): Razorpay | null {
  const env = getServerEnv();

  if (
    env.RAZORPAY_KEY_ID.includes("placeholder") ||
    env.RAZORPAY_KEY_ID.includes("sample") ||
    env.RAZORPAY_KEY_ID.includes("test_sample") ||
    env.RAZORPAY_KEY_ID.includes("mock")
  ) {
    return null;
  }

  if (!razorpayClientInstance) {
    razorpayClientInstance = new Razorpay({
      key_id: env.RAZORPAY_KEY_ID.trim(),
      key_secret: env.RAZORPAY_KEY_SECRET.trim(),
    });
  }

  return razorpayClientInstance;
}

/**
 * Creates a server-side order with Razorpay.
 * Amount MUST be in integer paise.
 */
export async function createRazorpayOrder(params: CreateOrderParams): Promise<RazorpayOrderResult> {
  const { amountPaise, currency = "INR", receipt, notes = {} } = params;

  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
    throw new Error(`Invalid order amount in paise: ${amountPaise}`);
  }

  const client = getRazorpayClient();

  if (!client) {
    if (isLivePaymentMode()) {
      throw new Error("Live payments enabled but RAZORPAY credentials are placeholders.");
    }
    // Return safe development mock order
    return {
      id: `order_mock_${crypto.randomBytes(8).toString("hex")}`,
      amount: amountPaise,
      currency,
      receipt,
      status: "created",
    };
  }

  try {
    const order = await client.orders.create({
      amount: amountPaise,
      currency,
      receipt,
      notes,
    });

    return {
      id: order.id,
      amount: Number(order.amount),
      currency: order.currency,
      receipt: order.receipt || receipt,
      status: order.status,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to create Razorpay order: ${msg}`);
  }
}

/**
 * Cryptographically verifies Razorpay payment signature using HMAC SHA256 with timing-safe comparison.
 */
export function verifyPaymentSignature(params: VerifyPaymentParams): boolean {
  const { orderId, paymentId, signature } = params;
  const env = getServerEnv();

  // Allow mock signatures during local test mode if key is placeholder or mock
  if (
    (env.RAZORPAY_KEY_ID.includes("placeholder") ||
      env.RAZORPAY_KEY_ID.includes("sample") ||
      env.RAZORPAY_KEY_ID.includes("mock")) &&
    !isLivePaymentMode()
  ) {
    if (signature.startsWith("mock_signature_") || signature === "valid_mock_signature") {
      return true;
    }
  }

  try {
    const text = `${orderId}|${paymentId}`;
    const expected = crypto
      .createHmac("sha256", env.RAZORPAY_KEY_SECRET.trim())
      .update(text)
      .digest("hex");

    const expectedBuf = Buffer.from(expected, "utf-8");
    const signatureBuf = Buffer.from(signature, "utf-8");

    if (expectedBuf.length !== signatureBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuf, signatureBuf);
  } catch {
    return false;
  }
}

/**
 * Verifies Razorpay webhook payload signature using HMAC SHA256 with timing-safe comparison.
 */
export function verifyWebhookSignature(payload: string, signature: string): boolean {
  const env = getServerEnv();

  // Mock test bypass only when credentials are explicitly placeholder in non-live mode
  if (
    (env.RAZORPAY_WEBHOOK_SECRET.includes("placeholder") ||
      env.RAZORPAY_WEBHOOK_SECRET.includes("sample") ||
      env.RAZORPAY_WEBHOOK_SECRET.includes("mock")) &&
    !isLivePaymentMode()
  ) {
    if (signature === "mock_webhook_signature") return true;
  }

  try {
    const expected = crypto
      .createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET.trim())
      .update(payload)
      .digest("hex");

    const expectedBuf = Buffer.from(expected, "utf-8");
    const signatureBuf = Buffer.from(signature, "utf-8");

    if (expectedBuf.length !== signatureBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuf, signatureBuf);
  } catch {
    return false;
  }
}

const mockPaymentRegistry = new Map<string, Partial<RazorpayPaymentDetails>>();

export function setMockPaymentDetails(
  paymentId: string,
  details: Partial<RazorpayPaymentDetails>
): void {
  mockPaymentRegistry.set(paymentId, details);
}

export function resetMockPaymentRegistry(): void {
  mockPaymentRegistry.clear();
}

/**
 * Fetches captured payment details directly from Razorpay API to confirm capture status and currency.
 */
export async function fetchPaymentDetails(paymentId: string): Promise<RazorpayPaymentDetails> {
  const client = getRazorpayClient();

  if (!client) {
    if (isLivePaymentMode()) {
      throw new Error("Live payments enabled but RAZORPAY credentials are placeholders.");
    }

    const registered = mockPaymentRegistry.get(paymentId);
    if (registered) {
      return {
        id: paymentId,
        order_id: registered.order_id || "order_mock_123",
        status: (registered.status || "captured") as RazorpayPaymentDetails["status"],
        amount: registered.amount ?? 100000,
        currency: registered.currency || "INR",
        method: registered.method || "card",
        error_code: registered.error_code,
        error_description: registered.error_description,
      };
    }

    return {
      id: paymentId,
      order_id: "order_mock_123",
      status: "captured",
      amount: 100000,
      currency: "INR",
      method: "card",
    };
  }

  try {
    const payment = await client.payments.fetch(paymentId);
    return {
      id: payment.id,
      order_id: String(payment.order_id),
      status: payment.status as RazorpayPaymentDetails["status"],
      amount: Number(payment.amount),
      currency: payment.currency,
      method: payment.method,
      error_code: payment.error_code,
      error_description: payment.error_description,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to fetch payment details from Razorpay: ${msg}`);
  }
}

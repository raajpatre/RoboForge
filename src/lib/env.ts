import { z } from "zod";

/**
 * Public Environment Variables Schema (accessible client-side and server-side)
 */
export const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().default("https://placeholder.supabase.co"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).default("placeholder-anon-key"),
  NEXT_PUBLIC_RAZORPAY_KEY_ID: z.string().min(1).default("rzp_test_placeholder"),
});

/**
 * Server Environment Variables Schema (NEVER exposed to client)
 */
export const serverEnvSchema = publicEnvSchema.extend({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).default("placeholder-service-role-key"),
  RAZORPAY_KEY_ID: z.string().min(1).default("rzp_test_placeholder"),
  RAZORPAY_KEY_SECRET: z.string().min(1).default("placeholder_razorpay_secret"),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1).default("placeholder_webhook_secret"),
  PAYMENT_MODE: z.enum(["test", "live"]).default("test"),
  ADMIN_EMAILS: z.string().default("admin@roboshopforge.local"),

  // Cloudinary Image CDN (optional — product image uploads)
  CLOUDINARY_CLOUD_NAME: z.string().default(""),
  CLOUDINARY_API_KEY: z.string().default(""),
  CLOUDINARY_API_SECRET: z.string().default(""),

  // Seller Statutory Configuration & Tax Mode
  SELLER_TAX_MODE: z.enum(["gst_registered", "unregistered", "composition"]).default("unregistered"),
  SELLER_LEGAL_NAME: z.string().default("RoboShop Forge Technologies Pvt Ltd"),
  SELLER_TRADE_NAME: z.string().default("RoboShop Forge"),
  SELLER_GSTIN: z.string().default(""),
  SELLER_PAN: z.string().default(""),
  SELLER_EMAIL: z.string().email().default("billing@roboshopforge.local"),
  SELLER_PHONE: z.string().default("+919876543210"),
  SELLER_ADDRESS_LINE1: z.string().default("Industrial Area, Peenya"),
  SELLER_ADDRESS_LINE2: z.string().optional().default(""),
  SELLER_CITY: z.string().default("Bengaluru"),
  SELLER_STATE: z.string().default("Karnataka"),
  SELLER_STATE_CODE: z.string().default("29"),
  SELLER_POSTAL_CODE: z.string().default("560058"),
  SELLER_COUNTRY: z.string().default("India"),

  // Operational & Policy Configuration
  SHIPPING_PROCESSING_DAYS: z.string().default("1 - 2 business days"),
  SHIPPING_TRANSIT_DAYS: z.string().default("3 - 5 business days across India"),
  SHIPPING_PARTNERS: z.string().default("BlueDart Express, Delhivery Freight, DTDC Air Cargo"),
  CANCELLATION_WINDOW: z.string().default("Permitted strictly prior to freight carrier dispatch / shipment"),
  REFUND_TURNAROUND: z.string().default("5 - 7 business days"),
  STORE_SUPPORT_HOURS: z.string().default("Monday - Saturday, 9:00 AM - 6:00 PM IST"),
  POLICIES_CONFIRMED: z.string().default("false"),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedServerEnv: ServerEnv | null = null;
let cachedPublicEnv: PublicEnv | null = null;

export function resetEnvCache(): void {
  cachedServerEnv = null;
  cachedPublicEnv = null;
}

/**
 * Returns validated public environment variables safe for browser or server.
 */
export function getPublicEnv(): PublicEnv {
  if (cachedPublicEnv && process.env.NODE_ENV !== "test") return cachedPublicEnv;

  const result = publicEnvSchema.safeParse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_RAZORPAY_KEY_ID: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
  });

  if (!result.success) {
    console.error("Invalid public environment variables:", result.error.format());
    throw new Error("Invalid public environment configuration.");
  }

  cachedPublicEnv = result.data;
  return cachedPublicEnv;
}

/**
 * Returns validated server-only environment variables. Throws if called in browser.
 */
export function getServerEnv(): ServerEnv {
  if (typeof window !== "undefined") {
    throw new Error("getServerEnv() must never be executed on the client.");
  }

  if (cachedServerEnv && process.env.NODE_ENV !== "test") return cachedServerEnv;

  const result = serverEnvSchema.safeParse(process.env);

  if (!result.success) {
    console.error("Invalid server environment variables:", result.error.format());
    throw new Error("Invalid server environment configuration.");
  }

  // Safety guard: Live launch must fail closed if required seller, shipping, policy or tax information is unconfigured
  if (result.data.PAYMENT_MODE === "live") {
    if (result.data.RAZORPAY_KEY_ID.startsWith("rzp_test_") || result.data.RAZORPAY_KEY_ID.includes("placeholder")) {
      throw new Error("Live launch failed closed: PAYMENT_MODE is 'live' but RAZORPAY_KEY_ID is a test or placeholder key.");
    }
    if (result.data.RAZORPAY_KEY_SECRET.includes("placeholder")) {
      throw new Error("Live launch failed closed: RAZORPAY_KEY_SECRET contains placeholder.");
    }
    if (result.data.RAZORPAY_WEBHOOK_SECRET.includes("placeholder")) {
      throw new Error("Live launch failed closed: RAZORPAY_WEBHOOK_SECRET contains placeholder.");
    }
    if (result.data.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")) {
      throw new Error("Live launch failed closed: NEXT_PUBLIC_SUPABASE_URL is unconfigured.");
    }
    if (result.data.SELLER_TAX_MODE === "gst_registered" && (!result.data.SELLER_GSTIN || result.data.SELLER_GSTIN.trim() === "")) {
      throw new Error("Live launch failed closed: SELLER_TAX_MODE is 'gst_registered' but SELLER_GSTIN is missing.");
    }
    if (result.data.POLICIES_CONFIRMED !== "true") {
      throw new Error("Live launch failed closed: POLICIES_CONFIRMED must be set to 'true' after reviewing published policies.");
    }
  }

  cachedServerEnv = result.data;
  return cachedServerEnv;
}

/**
 * Verifies whether a given email address is in the administrator allowlist.
 */
export function isEmailInAdminAllowlist(email: string | null | undefined): boolean {
  if (!email) return false;
  const env = getServerEnv();
  const allowlist = env.ADMIN_EMAILS.split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.includes(email.trim().toLowerCase());
}

/**
 * Checks if live payments are enabled and fully verified.
 */
export function isLivePaymentMode(): boolean {
  return getServerEnv().PAYMENT_MODE === "live";
}

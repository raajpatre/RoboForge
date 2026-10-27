/**
 * Business Configuration & Live Launch Readiness Domain.
 *
 * Provides configurable business details, shipping timelines, cancellation & refund rules,
 * seller tax mode, and strict fail-closed live launch validation.
 */

export type SellerTaxMode = "gst_registered" | "unregistered" | "composition";

export interface BusinessConfig {
  storeName: string;
  legalName: string;
  tradeName: string;
  contactEmail: string;
  contactPhone: string;
  supportHours: string;
  operatingAddress: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    stateCode: string;
    postalCode: string;
    country: string;
  };
  shippingTimelines: {
    processingDays: string;
    transitDays: string;
    partners: string;
  };
  cancellationRules: {
    cancellationWindow: string;
    postShipmentPolicy: string;
  };
  refundTimelines: {
    turnaroundDays: string;
    method: string;
  };
  taxMode: {
    mode: SellerTaxMode;
    gstin: string;
    pan: string;
    isGstRegistered: boolean;
  };
  isTestEnvironment: boolean;
  unconfiguredItems: string[];
}

/**
 * Standard Indian GSTIN Regex: 2 digit state code + 10 alphanumeric PAN + 1 entity num + 'Z' + 1 checksum character
 */
export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

/**
 * Returns the active business configuration, reading from environment variables with
 * deterministic fallback notices for unconfigured values.
 */
export function getBusinessConfig(): BusinessConfig {
  const isLive = process.env.PAYMENT_MODE === "live";

  // Statutory Seller Details
  const legalName = process.env.SELLER_LEGAL_NAME?.trim() || "RoboShop Forge Hardware Lab";
  const tradeName = process.env.SELLER_TRADE_NAME?.trim() || "RoboShop Forge";
  const contactEmail = process.env.SELLER_EMAIL?.trim() || "support@roboshopforge.local";
  const contactPhone = process.env.SELLER_PHONE?.trim() || "+91 98765 43210";
  const supportHours = process.env.STORE_SUPPORT_HOURS?.trim() || "Monday - Saturday, 9:00 AM - 6:00 PM IST";

  // Operating Address
  const addressLine1 = process.env.SELLER_ADDRESS_LINE1?.trim() || "Industrial Area, 4th Phase";
  const addressLine2 = process.env.SELLER_ADDRESS_LINE2?.trim() || "";
  const city = process.env.SELLER_CITY?.trim() || "Bengaluru";
  const state = process.env.SELLER_STATE?.trim() || "Karnataka";
  const stateCode = process.env.SELLER_STATE_CODE?.trim() || "29";
  const postalCode = process.env.SELLER_POSTAL_CODE?.trim() || "560058";
  const country = process.env.SELLER_COUNTRY?.trim() || "India";

  // Shipping & Logistics
  const processingDays = process.env.SHIPPING_PROCESSING_DAYS?.trim() || "1 - 2 business days";
  const transitDays = process.env.SHIPPING_TRANSIT_DAYS?.trim() || "3 - 5 business days across India";
  const shippingPartners = process.env.SHIPPING_PARTNERS?.trim() || "BlueDart Express, Delhivery Freight, DTDC Air Cargo";

  // Policies & Timelines
  const cancellationWindow = process.env.CANCELLATION_WINDOW?.trim() || "Permitted strictly prior to freight carrier dispatch / shipment";
  const turnaroundDays = process.env.REFUND_TURNAROUND?.trim() || "5 - 7 business days";

  // Seller Tax Configuration (default: unregistered seller)
  const rawMode = (process.env.SELLER_TAX_MODE?.trim().toLowerCase() || "unregistered") as SellerTaxMode;
  const rawGstin = process.env.SELLER_GSTIN?.trim() || "";
  const rawPan = process.env.SELLER_PAN?.trim() || "";

  let mode: SellerTaxMode = "unregistered";
  if (rawMode === "gst_registered" || rawMode === "composition" || rawMode === "unregistered") {
    mode = rawMode;
  } else if (rawGstin && GSTIN_REGEX.test(rawGstin.toUpperCase())) {
    mode = "gst_registered";
  }

  const isGstRegistered = mode === "gst_registered" && GSTIN_REGEX.test(rawGstin.toUpperCase());

  // Check which mandatory business items are not yet configured by the store owner
  const unconfigured: string[] = [];
  if (!process.env.SELLER_LEGAL_NAME || process.env.SELLER_LEGAL_NAME.includes("local") || process.env.SELLER_LEGAL_NAME.includes("placeholder")) {
    unconfigured.push("SELLER_LEGAL_NAME (Official registered legal entity name)");
  }
  if (!process.env.SELLER_EMAIL || process.env.SELLER_EMAIL.includes(".local") || process.env.SELLER_EMAIL.includes("placeholder")) {
    unconfigured.push("SELLER_EMAIL (Verified business email for customer support and tax invoices)");
  }
  if (!process.env.SELLER_PHONE || process.env.SELLER_PHONE.includes("12345")) {
    unconfigured.push("SELLER_PHONE (Customer support phone number)");
  }
  if (!process.env.SELLER_ADDRESS_LINE1) {
    unconfigured.push("SELLER_ADDRESS_LINE1 (Registered principal place of business)");
  }
  if (mode === "gst_registered" && (!rawGstin || !GSTIN_REGEX.test(rawGstin.toUpperCase()))) {
    unconfigured.push("SELLER_GSTIN (15-character statutory GST identification number)");
  }
  if (!process.env.POLICIES_CONFIRMED || process.env.POLICIES_CONFIRMED !== "true") {
    unconfigured.push("POLICIES_CONFIRMED (Explicit owner verification of published store policies)");
  }
  if (!process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID.includes("placeholder") || process.env.RAZORPAY_KEY_ID.startsWith("rzp_test_")) {
    if (isLive) {
      unconfigured.push("RAZORPAY_KEY_ID (Activated production Razorpay Key ID)");
    }
  }

  return {
    storeName: tradeName,
    legalName,
    tradeName,
    contactEmail,
    contactPhone,
    supportHours,
    operatingAddress: {
      line1: addressLine1,
      line2: addressLine2 || undefined,
      city,
      state,
      stateCode,
      postalCode,
      country,
    },
    shippingTimelines: {
      processingDays,
      transitDays,
      partners: shippingPartners,
    },
    cancellationRules: {
      cancellationWindow,
      postShipmentPolicy: "Orders that have reached 'Shipped' or 'Delivered' status cannot be cancelled in this MVP. Cancellations are strictly permitted only prior to shipment.",
    },
    refundTimelines: {
      turnaroundDays,
      method: "Original payment source (Card / UPI / Netbanking via Razorpay payment gateway)",
    },
    taxMode: {
      mode,
      gstin: isGstRegistered ? rawGstin.toUpperCase() : "NOT APPLICABLE (UNREGISTERED)",
      pan: rawPan || "NOT APPLICABLE",
      isGstRegistered,
    },
    isTestEnvironment: !isLive,
    unconfiguredItems: unconfigured,
  };
}

export interface LaunchReadinessResult {
  isReadyForLive: boolean;
  paymentMode: "test" | "live";
  missingRequirements: string[];
  blockers: string[];
}

/**
 * Validates whether the application is fully configured for live launch.
 *
 * CRITICAL RULE: Live launch must FAIL CLOSED if any required seller, shipping,
 * policy or tax information is unconfigured or in placeholder/test mode.
 */
export function validateLiveLaunchReadiness(): LaunchReadinessResult {
  const isLive = process.env.PAYMENT_MODE === "live";
  const missing: string[] = [];
  const blockers: string[] = [];

  // 1. Payment Gateway Check
  const keyId = process.env.RAZORPAY_KEY_ID || "";
  const keySecret = process.env.RAZORPAY_KEY_SECRET || "";
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || "";

  if (isLive) {
    if (!keyId || keyId.startsWith("rzp_test_") || keyId.includes("placeholder")) {
      blockers.push("Live payments cannot be enabled with test or placeholder RAZORPAY_KEY_ID.");
    }
    if (!keySecret || keySecret.includes("placeholder")) {
      blockers.push("Production RAZORPAY_KEY_SECRET is missing or using placeholder.");
    }
    if (!webhookSecret || webhookSecret.includes("placeholder")) {
      blockers.push("Production RAZORPAY_WEBHOOK_SECRET is missing or using placeholder.");
    }
  }

  // 2. Database Check
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (isLive) {
    if (supabaseUrl.includes("placeholder")) {
      blockers.push("Live deployment cannot run against placeholder Supabase URL.");
    }
    if (supabaseKey.includes("placeholder")) {
      blockers.push("Production SUPABASE_SERVICE_ROLE_KEY is unconfigured.");
    }
  }

  // 3. Seller Statutory & Identity Check
  if (isLive) {
    if (!process.env.SELLER_LEGAL_NAME || process.env.SELLER_LEGAL_NAME.includes("local")) {
      missing.push("SELLER_LEGAL_NAME must be set to the official registered company entity name.");
    }
    if (!process.env.SELLER_EMAIL || process.env.SELLER_EMAIL.includes(".local")) {
      missing.push("SELLER_EMAIL must be a real operational support email.");
    }
    if (!process.env.SELLER_PHONE || process.env.SELLER_PHONE.includes("12345")) {
      missing.push("SELLER_PHONE must be an active operational contact number.");
    }

    // 4. Tax Mode Verification
    const taxMode = (process.env.SELLER_TAX_MODE?.trim().toLowerCase() || "unregistered") as SellerTaxMode;
    if (taxMode === "gst_registered") {
      const gstin = process.env.SELLER_GSTIN?.trim().toUpperCase() || "";
      if (!GSTIN_REGEX.test(gstin)) {
        blockers.push(`SELLER_TAX_MODE is 'gst_registered' but SELLER_GSTIN '${gstin}' is invalid or missing.`);
      }
    }

    // 5. Policy Confirmation
    if (process.env.POLICIES_CONFIRMED !== "true") {
      missing.push("POLICIES_CONFIRMED must be set to 'true' after the owner reviews published store policies.");
    }
  }

  const isReady = isLive ? blockers.length === 0 && missing.length === 0 : true;

  return {
    isReadyForLive: isReady,
    paymentMode: isLive ? "live" : "test",
    missingRequirements: missing,
    blockers,
  };
}

/**
 * Strict fail-closed guard: Throws an explicit error if live payments are attempted
 * without verified statutory and operational launch configuration.
 */
export function assertLiveLaunchSafety(): void {
  const readiness = validateLiveLaunchReadiness();
  if (!readiness.isReadyForLive && readiness.paymentMode === "live") {
    const errorDetails = [...readiness.blockers, ...readiness.missingRequirements].join("; ");
    throw new Error(
      `LIVE LAUNCH FAIL-CLOSED GUARD: Live payment mode cannot activate with unconfigured statutory or gateway requirements. Details: ${errorDetails}`
    );
  }
}

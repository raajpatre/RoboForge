import { z } from "zod";
import { isValidOrderCode, normalizeOrderCode } from "./crypto";

/**
 * Indian Mobile Phone Regex:
 * Matches optional +91 prefix, followed by standard 10-digit mobile starting with 6, 7, 8, or 9.
 */
const INDIAN_PHONE_REGEX = /^(?:\+91\s?|91)?([6-9]\d{9})$/;

/**
 * Indian 6-Digit Postal Code (PIN Code) Regex:
 * Must not begin with 0.
 */
const INDIAN_PIN_CODE_REGEX = /^[1-9][0-9]{5}$/;

/**
 * Shipping Address Schema
 */
export const shippingAddressSchema = z.object({
  line1: z
    .string()
    .trim()
    .min(3, "Address line 1 must be at least 3 characters")
    .max(120, "Address line 1 must not exceed 120 characters"),
  line2: z
    .string()
    .trim()
    .max(120, "Address line 2 must not exceed 120 characters")
    .optional()
    .default(""),
  city: z
    .string()
    .trim()
    .min(2, "City name must be at least 2 characters")
    .max(60, "City name must not exceed 60 characters"),
  state: z
    .string()
    .trim()
    .min(2, "State must be at least 2 characters")
    .max(60, "State must not exceed 60 characters"),
  state_code: z.string().trim().max(5).optional().default(""),
  postal_code: z
    .string()
    .trim()
    .regex(INDIAN_PIN_CODE_REGEX, "Postal code must be a valid 6-digit Indian PIN code"),
  country: z.string().trim().default("India"),
});

/**
 * Customer Details Schema (collected at checkout)
 */
export const customerDetailsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Full name must be at least 2 characters")
    .max(100, "Full name must not exceed 100 characters"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("A valid email address is required for order confirmation"),
  phone: z
    .string()
    .trim()
    .transform((val) => val.replace(/[\s-]/g, ""))
    .refine(
      (val) => INDIAN_PHONE_REGEX.test(val),
      "Please enter a valid 10-digit Indian mobile number"
    )
    .transform((val) => {
      const match = INDIAN_PHONE_REGEX.exec(val);
      return match ? `+91${match[1]}` : val;
    }),
  shippingAddress: shippingAddressSchema,
});

/**
 * Cart Item Payload submitted by browser during checkout initiation
 */
export const checkoutCartItemSchema = z.object({
  productId: z.string().uuid("Invalid product ID format"),
  quantity: z
    .number()
    .int("Quantity must be an integer")
    .min(1, "Quantity must be at least 1")
    .max(10, "Maximum 10 units of an item per order"),
});

/**
 * Checkout Request Submission Schema
 */
export const checkoutRequestSchema = z.object({
  customer: customerDetailsSchema,
  items: z
    .array(checkoutCartItemSchema)
    .min(1, "At least one item is required to checkout")
    .max(20, "Cannot purchase more than 20 distinct items per order"),
});

/**
 * 128-bit Cryptographic Order Code Schema
 */
export const orderCodeSchema = z
  .string()
  .trim()
  .transform(normalizeOrderCode)
  .refine(isValidOrderCode, "Invalid order code format. Expected: RBF-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX");

/**
 * Zero-PII Order Tracking Request Schema
 */
export const orderTrackingRequestSchema = z.object({
  orderCode: orderCodeSchema,
});

/**
 * Admin Product CRUD Schema
 */
export const adminProductSchema = z.object({
  name: z.string().trim().min(2, "Product name is required").max(150),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, "Slug must be at least 2 characters")
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must contain only lowercase letters, numbers, and single hyphens"),
  sku: z
    .string()
    .trim()
    .min(3, "SKU must be at least 3 characters")
    .max(50)
    .toUpperCase()
    .default(""),
  category: z.string().trim().min(2, "Category is required").max(50).default("robotics"),
  description: z.string().trim().max(5000).default(""),
  price_paise: z
    .number()
    .int("Price must be an integer in paise")
    .min(0, "Price cannot be negative"),
  image_url: z.string().trim().url("Must be a valid URL").or(z.literal("")).default(""),
  hsn_code: z
    .string()
    .trim()
    .min(4, "HSN code must be at least 4 digits")
    .max(10)
    .default("84795000"),
  tax_rate_bps: z
    .number()
    .int()
    .min(0)
    .max(10000)
    .default(1800), // 18% standard GST
  is_active: z.boolean().default(true),
  stock_on_hand: z
    .number()
    .int("Stock on hand must be an integer")
    .min(0, "Stock cannot be negative")
    .default(0),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
});

export type ShippingAddressInput = z.infer<typeof shippingAddressSchema>;
export type CustomerDetailsInput = z.infer<typeof customerDetailsSchema>;
export type CheckoutCartItemInput = z.infer<typeof checkoutCartItemSchema>;
export type CheckoutRequestInput = z.infer<typeof checkoutRequestSchema>;
export type AdminProductInput = z.input<typeof adminProductSchema>;
export type AdminProductOutput = z.infer<typeof adminProductSchema>;

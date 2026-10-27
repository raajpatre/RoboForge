/**
 * Money & Tax Calculation Service
 *
 * Rules:
 * - All monetary values are strictly represented and calculated as integer paise (1 INR = 100 paise).
 * - Floating point operations for currency storage or balances are forbidden to prevent rounding drift.
 * - Browser-supplied prices, totals, or tax rates are NEVER trusted.
 */

export interface OrderItemCalculationInput {
  unitPricePaise: number;
  quantity: number;
  taxRateBps: number; // Basis points: 1800 = 18.00%
}

export interface CalculatedItemTotal {
  unitPricePaise: number;
  quantity: number;
  taxRateBps: number;
  subtotalPaise: number; // Pre-tax base amount
  taxPaise: number;      // Calculated GST
  totalPaise: number;    // Subtotal + Tax
}

export interface CalculatedOrderTotals {
  items: CalculatedItemTotal[];
  subtotalPaise: number;
  taxPaise: number;
  shippingPaise: number;
  totalPaise: number;
  currency: string;
}

/**
 * Validates that an amount is a safe, non-negative integer paise value.
 */
export function assertValidPaise(paise: unknown, fieldName = "amount"): asserts paise is number {
  if (
    typeof paise !== "number" ||
    !Number.isSafeInteger(paise) ||
    paise < 0
  ) {
    throw new Error(`Invalid ${fieldName}: must be a non-negative integer paise amount. Received: ${paise}`);
  }
}

/**
 * Converts integer paise to rupees (for display only).
 */
export function paiseToRupees(paise: number): number {
  assertValidPaise(paise, "paise");
  return paise / 100;
}

/**
 * Converts decimal rupees to integer paise using integer math.
 */
export function rupeesToPaise(rupees: number): number {
  if (typeof rupees !== "number" || !Number.isFinite(rupees) || rupees < 0) {
    throw new Error(`Invalid rupees value: ${rupees}`);
  }
  // Math.round handles any binary floating-point representation quirks (e.g. 19.99 * 100 = 1998.9999999999998)
  return Math.round(rupees * 100);
}

/**
 * Calculates GST amount for an item given taxable base paise and tax rate in basis points.
 * Standard Half-Up rounding is applied to avoid bias.
 * 
 * Formula: round((taxablePaise * taxRateBps) / 10000)
 */
export function calculateItemTax(taxablePaise: number, taxRateBps: number): number {
  assertValidPaise(taxablePaise, "taxablePaise");
  if (!Number.isSafeInteger(taxRateBps) || taxRateBps < 0 || taxRateBps > 10000) {
    throw new Error(`Invalid taxRateBps: must be between 0 and 10000. Received: ${taxRateBps}`);
  }

  if (taxRateBps === 0 || taxablePaise === 0) return 0;

  // Exact integer math with Math.round
  return Math.round((taxablePaise * taxRateBps) / 10000);
}

/**
 * Calculates item subtotal, tax, and total.
 */
export function calculateItemTotals(input: OrderItemCalculationInput): CalculatedItemTotal {
  assertValidPaise(input.unitPricePaise, "unitPricePaise");
  if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) {
    throw new Error(`Invalid quantity: must be positive integer. Received: ${input.quantity}`);
  }

  const subtotalPaise = input.unitPricePaise * input.quantity;
  const taxPaise = calculateItemTax(subtotalPaise, input.taxRateBps);
  const totalPaise = subtotalPaise + taxPaise;

  return {
    unitPricePaise: input.unitPricePaise,
    quantity: input.quantity,
    taxRateBps: input.taxRateBps,
    subtotalPaise,
    taxPaise,
    totalPaise,
  };
}

/**
 * Calculates authoritative order totals given a verified list of items and optional shipping charge.
 * Guarantees totalPaise = subtotalPaise + taxPaise + shippingPaise.
 */
export function calculateOrderTotals(
  items: OrderItemCalculationInput[],
  shippingPaise = 0
): CalculatedOrderTotals {
  assertValidPaise(shippingPaise, "shippingPaise");

  if (!items || items.length === 0) {
    throw new Error("Cannot calculate order totals for an empty item list.");
  }

  const calculatedItems = items.map((item) => calculateItemTotals(item));

  const subtotalPaise = calculatedItems.reduce((acc, curr) => acc + curr.subtotalPaise, 0);
  const taxPaise = calculatedItems.reduce((acc, curr) => acc + curr.taxPaise, 0);
  const totalPaise = subtotalPaise + taxPaise + shippingPaise;

  return {
    items: calculatedItems,
    subtotalPaise,
    taxPaise,
    shippingPaise,
    totalPaise,
    currency: "INR",
  };
}

/**
 * Formats integer paise into a localized INR currency string with standard Indian number grouping (lakhs/crores).
 * Example: 18500000 paise -> "₹1,85,000.00"
 */
export function formatINR(paise: number, options: { showPaise?: boolean } = {}): string {
  assertValidPaise(paise, "paise");
  const { showPaise = true } = options;
  const rupees = paise / 100;

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: showPaise ? 2 : 0,
    maximumFractionDigits: showPaise ? 2 : 0,
  }).format(rupees);
}

/**
 * Formats integer paise into ASCII-safe INR representation (e.g. "INR 1,85,000.00").
 * Used for PDF documents where standard fonts (Helvetica) lack the Unicode Rupee glyph.
 */
export function formatINRAscii(paise: number): string {
  assertValidPaise(paise, "paise");
  const rupees = paise / 100;
  const formatted = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rupees);
  return `INR ${formatted}`;
}

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const TENS = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
];

function convertTwoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const ten = Math.floor(n / 10);
  const one = n % 10;
  return `${TENS[ten]}${one > 0 ? " " + ONES[one] : ""}`;
}

function convertThreeDigits(n: number): string {
  const hundred = Math.floor(n / 100);
  const remainder = n % 100;
  if (hundred > 0 && remainder > 0) {
    return `${ONES[hundred]} Hundred ${convertTwoDigits(remainder)}`;
  }
  if (hundred > 0) {
    return `${ONES[hundred]} Hundred`;
  }
  return convertTwoDigits(remainder);
}

/**
 * Converts integer paise into Indian currency words representation.
 * Example: 21830000 paise -> "Two Lakh Eighteen Thousand Three Hundred Rupees Only"
 */
export function amountToWordsINR(paise: number): string {
  assertValidPaise(paise, "paise");
  const rupees = Math.floor(paise / 100);
  const paiseRemainder = paise % 100;

  if (rupees === 0 && paiseRemainder === 0) {
    return "Zero Rupees Only";
  }

  let words = "";
  let remaining = rupees;

  const crore = Math.floor(remaining / 10000000);
  remaining %= 10000000;
  const lakh = Math.floor(remaining / 100000);
  remaining %= 100000;
  const thousand = Math.floor(remaining / 1000);
  remaining %= 1000;
  const hundredAndLess = remaining;

  if (crore > 0) {
    words += `${convertTwoDigits(crore)} Crore `;
  }
  if (lakh > 0) {
    words += `${convertTwoDigits(lakh)} Lakh `;
  }
  if (thousand > 0) {
    words += `${convertTwoDigits(thousand)} Thousand `;
  }
  if (hundredAndLess > 0) {
    words += `${convertThreeDigits(hundredAndLess)} `;
  }

  words = words.trim();
  if (words.length > 0) {
    words += " Rupees";
  }

  if (paiseRemainder > 0) {
    const paiseWords = convertTwoDigits(paiseRemainder);
    words += words.length > 0 ? ` and ${paiseWords} Paise` : `${paiseWords} Paise`;
  }

  return `${words.trim()} Only`;
}

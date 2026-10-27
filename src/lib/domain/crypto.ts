/**
 * Cryptographic Utilities for RoboShop Forge
 *
 * Requirements:
 * - Generate unpredictable cryptographically random order/tracking codes with >= 128 bits of entropy.
 * - Never generate sequential, guessable, or predictable identifiers.
 * - Tracking security relies completely on the entropy of this secret possession token.
 */

const ORDER_CODE_PREFIX = "RBF";
const ORDER_CODE_REGEX = /^RBF-[0-9A-F]{8}-[0-9A-F]{8}-[0-9A-F]{8}-[0-9A-F]{8}$/;

/**
 * Generates an unpredictable cryptographically secure order tracking code.
 *
 * Entropy Calculation:
 * - 16 bytes = 128 bits of cryptographically strong pseudo-random data.
 * - Formatted as 32 uppercase hexadecimal characters across 4 hyphen-separated blocks:
 *   RBF-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX
 * - Total keyspace: 2^128 ~= 3.4 x 10^38 possible combinations.
 * - Brute force attack at 1 billion guesses per second would take > 10^22 years.
 */
export function generateOrderCode(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
    .join("");

  // 32 hex characters partitioned into 4 blocks of 8
  const block1 = hex.slice(0, 8);
  const block2 = hex.slice(8, 16);
  const block3 = hex.slice(16, 24);
  const block4 = hex.slice(24, 32);

  return `${ORDER_CODE_PREFIX}-${block1}-${block2}-${block3}-${block4}`;
}

/**
 * Validates whether a provided order code matches the exact format and 128-bit structure.
 */
export function isValidOrderCode(code: unknown): code is string {
  if (typeof code !== "string") return false;
  return ORDER_CODE_REGEX.test(code.trim().toUpperCase());
}

/**
 * Normalizes an order code by trimming whitespace and converting to uppercase.
 */
export function normalizeOrderCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Generates a cryptographically random idempotency key for transactions.
 */
export function generateIdempotencyKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

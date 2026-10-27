import { describe, it, expect } from "vitest";
import {
  generateOrderCode,
  isValidOrderCode,
  normalizeOrderCode,
  generateIdempotencyKey,
} from "../crypto";

describe("Cryptographic Token & Tracking Code Service", () => {
  it("generates order codes adhering to >= 128-bit structure and RBF format", () => {
    const code = generateOrderCode();

    expect(code).toMatch(/^RBF-[0-9A-F]{8}-[0-9A-F]{8}-[0-9A-F]{8}-[0-9A-F]{8}$/);
    expect(code.length).toBe(39); // "RBF-" (4) + 8 + 1 + 8 + 1 + 8 + 1 + 8 = 39
    expect(isValidOrderCode(code)).toBe(true);
  });

  it("guarantees high entropy with zero collisions across 5,000 generated codes", () => {
    const SAMPLE_SIZE = 5000;
    const codes = new Set<string>();

    for (let i = 0; i < SAMPLE_SIZE; i++) {
      const code = generateOrderCode();
      expect(isValidOrderCode(code)).toBe(true);
      codes.add(code);
    }

    expect(codes.size).toBe(SAMPLE_SIZE);
  });

  it("strictly rejects guessable, sequential, or tampered order codes", () => {
    expect(isValidOrderCode("12345")).toBe(false);
    expect(isValidOrderCode("ORD-0001")).toBe(false);
    expect(isValidOrderCode("RBF-12345678")).toBe(false);
    expect(isValidOrderCode("RBF-12345678-12345678-12345678")).toBe(false); // only 3 blocks
    expect(isValidOrderCode("RBF-ZZZZZZZZ-12345678-12345678-12345678")).toBe(false); // non-hex
    expect(isValidOrderCode("")).toBe(false);
    expect(isValidOrderCode(null)).toBe(false);
    expect(isValidOrderCode(undefined)).toBe(false);
    expect(isValidOrderCode(12345)).toBe(false);
  });

  it("normalizes order codes by trimming whitespace and capitalizing", () => {
    const raw = "  rbf-a1b2c3d4-e5f60718-9a0b1c2d-3e4f5a6b  ";
    const normalized = normalizeOrderCode(raw);
    expect(normalized).toBe("RBF-A1B2C3D4-E5F60718-9A0B1C2D-3E4F5A6B");
    expect(isValidOrderCode(normalized)).toBe(true);
  });

  it("generates unique 128-bit idempotency keys", () => {
    const key1 = generateIdempotencyKey();
    const key2 = generateIdempotencyKey();

    expect(key1).toMatch(/^[0-9a-f]{32}$/);
    expect(key2).toMatch(/^[0-9a-f]{32}$/);
    expect(key1).not.toBe(key2);
  });
});

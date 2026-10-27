import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  publicEnvSchema,
  serverEnvSchema,
  isEmailInAdminAllowlist,
} from "../env";

describe("Environment Configuration & Security", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("validates public environment variables with valid defaults", () => {
    const parsed = publicEnvSchema.parse({});
    expect(parsed.NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");
    expect(parsed.NEXT_PUBLIC_SUPABASE_URL).toBe("https://placeholder.supabase.co");
    expect(parsed.NEXT_PUBLIC_RAZORPAY_KEY_ID).toBe("rzp_test_placeholder");
  });

  it("validates server environment schema correctly in test mode", () => {
    const parsed = serverEnvSchema.parse({
      ADMIN_EMAILS: "admin@roboshopforge.local, ops@roboshopforge.local",
      PAYMENT_MODE: "test",
    });
    expect(parsed.PAYMENT_MODE).toBe("test");
    expect(parsed.ADMIN_EMAILS).toContain("admin@roboshopforge.local");
  });

  it("enforces admin allowlist matching case-insensitively and handles whitespace", () => {
    process.env.ADMIN_EMAILS = "Admin@RoboShopForge.local , lead@roboshopforge.local ";
    expect(isEmailInAdminAllowlist("admin@roboshopforge.local")).toBe(true);
    expect(isEmailInAdminAllowlist("ADMIN@ROBOSHOPFORGE.LOCAL")).toBe(true);
    expect(isEmailInAdminAllowlist("lead@roboshopforge.local")).toBe(true);
    expect(isEmailInAdminAllowlist("attacker@example.com")).toBe(false);
    expect(isEmailInAdminAllowlist(null)).toBe(false);
    expect(isEmailInAdminAllowlist(undefined)).toBe(false);
    expect(isEmailInAdminAllowlist("")).toBe(false);
  });
});

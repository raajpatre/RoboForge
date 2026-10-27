import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  isEmailAuthorizedAdmin,
  requireAdminUser,
} from "../admin-guard";
import { loginAdminAction } from "@/app/actions/auth";
import { resetEnvCache } from "@/lib/env";

describe("Admin Authentication & Authorization Guard", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.ADMIN_EMAILS = "admin@roboshopforge.local,staff@roboshopforge.local";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://placeholder.supabase.co";
    resetEnvCache();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetEnvCache();
  });

  it("authorizes emails strictly matching ADMIN_EMAILS allowlist", () => {
    expect(isEmailAuthorizedAdmin("admin@roboshopforge.local")).toBe(true);
    expect(isEmailAuthorizedAdmin("staff@roboshopforge.local")).toBe(true);
    expect(isEmailAuthorizedAdmin("  ADMIN@roboshopforge.local  ")).toBe(true); // Case-insensitive, trimmed

    expect(isEmailAuthorizedAdmin("intruder@example.com")).toBe(false);
    expect(isEmailAuthorizedAdmin("")).toBe(false);
    expect(isEmailAuthorizedAdmin(null)).toBe(false);
  });

  it("returns active admin user in test sandbox environment", async () => {
    const adminUser = await requireAdminUser();
    expect(adminUser).toBeDefined();
    expect(adminUser.email).toBe("admin@roboshopforge.local");
    expect(adminUser.id).toBeDefined();
  });

  it("rejects login when required credentials are missing", async () => {
    const formData = new FormData();
    const res = await loginAdminAction(formData);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Email and password are required/);
  });

  it("authorizes allowlisted admin in test mode and denies unauthorized emails", async () => {
    const validFormData = new FormData();
    validFormData.append("email", "admin@roboshopforge.local");
    validFormData.append("password", "any_password");

    const validRes = await loginAdminAction(validFormData);
    expect(validRes.success).toBe(true);

    const invalidFormData = new FormData();
    invalidFormData.append("email", "stranger@unknown.org");
    invalidFormData.append("password", "any_password");

    const invalidRes = await loginAdminAction(invalidFormData);
    expect(invalidRes.success).toBe(false);
    expect(invalidRes.error).toMatch(/not in the ADMIN_EMAILS allowlist/);
  });

  it("throws UNAUTHORIZED when no authenticated user session exists in non-placeholder mode", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://live-test.supabase.co";
    resetEnvCache();

    // Mock createClient to return no user session
    const { vi } = await import("vitest");
    const supabaseServer = await import("@/lib/supabase/server");
    vi.spyOn(supabaseServer, "createClient").mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error("No session") }),
      },
    } as unknown as Awaited<ReturnType<typeof supabaseServer.createClient>>);

    await expect(requireAdminUser()).rejects.toThrow("UNAUTHORIZED: Active admin session required.");
  });

  it("throws FORBIDDEN when authenticated user is not in ADMIN_EMAILS allowlist", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://live-test.supabase.co";
    resetEnvCache();

    const { vi } = await import("vitest");
    const supabaseServer = await import("@/lib/supabase/server");
    vi.spyOn(supabaseServer, "createClient").mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-999", email: "hacker@intruder.net" } },
          error: null,
        }),
      },
    } as unknown as Awaited<ReturnType<typeof supabaseServer.createClient>>);

    await expect(requireAdminUser()).rejects.toThrow(/FORBIDDEN: User hacker@intruder.net is not in the authorized administrative allowlist/);
  });
});

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getServerEnv, getPublicEnv } from "@/lib/env";

export interface AdminUser {
  id: string;
  email: string;
}

/**
 * Checks if the provided email exists in the ADMIN_EMAILS allowlist.
 */
export function isEmailAuthorizedAdmin(email?: string | null): boolean {
  if (!email) return false;
  const env = getServerEnv();
  const allowed = env.ADMIN_EMAILS.split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  return allowed.includes(email.trim().toLowerCase());
}

/**
 * Authoritative Server-Side Guard.
 * Returns the authenticated AdminUser if authorized, or throws an Error.
 */
export async function requireAdminUser(): Promise<AdminUser> {
  const publicEnv = getPublicEnv();
  const isPlaceholderDb = publicEnv.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder");

  // In test / sandbox environments with placeholder credentials:
  if (isPlaceholderDb) {
    const env = getServerEnv();
    const primaryAdmin = env.ADMIN_EMAILS.split(",")[0]?.trim() || "admin@roboshopforge.local";
    return {
      id: "mock-admin-uuid-0000",
      email: primaryAdmin,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user || !user.email) {
    throw new Error("UNAUTHORIZED: Active admin session required.");
  }

  if (!isEmailAuthorizedAdmin(user.email)) {
    throw new Error(
      `FORBIDDEN: User ${user.email} is not in the authorized administrative allowlist.`
    );
  }

  return {
    id: user.id,
    email: user.email,
  };
}

/**
 * Non-throwing variant for page components and conditional layouts.
 */
export async function getAdminUser(): Promise<AdminUser | null> {
  try {
    return await requireAdminUser();
  } catch {
    return null;
  }
}

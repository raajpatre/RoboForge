"use server";

import { createClient } from "@/lib/supabase/server";
import { isEmailAuthorizedAdmin } from "@/lib/auth/admin-guard";
import { getPublicEnv } from "@/lib/env";
import { redirect } from "next/navigation";

/**
 * Server action to authenticate staff with Supabase Auth or test allowlist
 */
export async function loginAdminAction(formData: FormData): Promise<{ success: boolean; error?: string }> {
  const email = (formData.get("email") as string)?.trim();
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { success: false, error: "Email and password are required." };
  }

  const publicEnv = getPublicEnv();
  const isPlaceholderDb = publicEnv.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder");

  if (isPlaceholderDb) {
    if (!isEmailAuthorizedAdmin(email)) {
      return {
        success: false,
        error: `Email ${email} is not in the ADMIN_EMAILS allowlist.`,
      };
    }
    // In mock mode, allow instant login
    return { success: true };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    return { success: false, error: error?.message || "Invalid credentials." };
  }

  if (!isEmailAuthorizedAdmin(data.user.email)) {
    await supabase.auth.signOut();
    return {
      success: false,
      error: "Access Denied: Your account is not authorized for administrative access.",
    };
  }

  return { success: true };
}

/**
 * Server action to terminate admin session
 */
export async function logoutAdminAction(): Promise<void> {
  const publicEnv = getPublicEnv();
  if (!publicEnv.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/admin/login");
}

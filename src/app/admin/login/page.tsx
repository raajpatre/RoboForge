"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loginAdminAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShieldCheck, Lock, AlertCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@roboshopforge.local");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    const formData = new FormData();
    formData.append("email", email);
    formData.append("password", password || "admin_password");

    try {
      const res = await loginAdminAction(formData);
      if (res.success) {
        router.push("/admin");
        router.refresh();
      } else {
        setErrorMessage(res.error || "Login failed. Check your credentials.");
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "An unexpected authentication error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 py-12 bg-background relative overflow-hidden">
      {/* Background radial glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md space-y-8 relative z-10">
        {/* Brand Header */}
        <div className="text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 mb-6 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            <span>Return to Storefront</span>
          </Link>

          <Image
            src="/images/logo.png"
            alt="RoboForge Logo"
            width={180}
            height={40}
            priority
            className="h-10 w-auto mx-auto mb-3 object-contain"
          />
          <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mt-1">
            Staff & Operations Console
          </p>
        </div>

        {/* Login Box */}
        <div className="rounded-2xl border border-border/80 bg-card p-6 sm:p-8 shadow-sm">
          <div className="flex items-center gap-2 mb-6 pb-4 border-b border-border/60 text-xs font-mono text-muted-foreground">
            <ShieldCheck className="size-4 text-primary" />
            <span>Server-Guarded Admin Authorization</span>
          </div>

          {errorMessage && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3.5 text-destructive flex items-start gap-2.5 mb-6 text-xs">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="admin-email"
                className="block text-xs font-medium text-foreground mb-1.5"
              >
                Staff Email (Allowlisted)
              </label>
              <Input
                id="admin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@roboshopforge.local"
                className="h-10 text-xs font-mono"
                required
              />
            </div>

            <div>
              <label
                htmlFor="admin-password"
                className="block text-xs font-medium text-foreground mb-1.5"
              >
                Password
              </label>
              <Input
                id="admin-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="h-10 text-xs"
                required={!email.includes("admin")}
              />
            </div>

            <Button
              id="admin-login-submit-btn"
              type="submit"
              disabled={isLoading}
              className="w-full h-10 font-mono text-xs font-semibold gap-2 mt-2 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <div className="size-3.5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                  <span>Authenticating...</span>
                </>
              ) : (
                <>
                  <Lock className="size-3.5" />
                  <span>Authenticate Session</span>
                </>
              )}
            </Button>
          </form>

          {/* Test Sandbox Callout */}
          <div className="mt-6 pt-4 border-t border-border/60 text-[11px] font-mono text-muted-foreground">
            <p className="font-semibold text-foreground/80 mb-1">Sandbox Test Notice:</p>
            <p className="leading-relaxed">
              In test mode, any email listed in <code className="text-foreground">ADMIN_EMAILS</code> (default: <code className="text-foreground">admin@roboshopforge.local</code>) bypasses external auth for rapid local testing.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

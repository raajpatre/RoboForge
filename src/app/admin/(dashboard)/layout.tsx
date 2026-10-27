import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/auth/admin-guard";
import { logoutAdminAction } from "@/app/actions/auth";
import {
  Package,
  ShoppingCart,
  LayoutDashboard,
  ExternalLink,
  LogOut,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export default async function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const adminUser = await getAdminUser();

  if (!adminUser) {
    redirect("/admin/login");
  }

  const navItems = [
    { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
    { href: "/admin/products", label: "Products & Stock", icon: Package },
    { href: "/admin/orders", label: "Orders & Fulfillment", icon: ShoppingCart },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top Operations Header */}
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 backdrop-blur-md">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Left: Brand & Nav Links */}
          <div className="flex items-center gap-8">
            <Link
              href="/admin"
              className="flex items-center gap-2.5 font-heading font-bold text-foreground text-sm tracking-tight"
            >
              <Image
                src="/images/logo.png"
                alt="RoboForge Logo"
                width={130}
                height={28}
                priority
                className="h-7 w-auto object-contain"
              />
            </Link>

            <nav className="flex items-center gap-1 sm:gap-2">
              {navItems.map((item) => {
                const ItemIcon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                  >
                    <ItemIcon className="size-3.5" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right: User Status & Logout */}
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-muted/40 text-[11px] font-mono text-muted-foreground">
              <ShieldAlert className="size-3 text-emerald-500" />
              <span className="truncate max-w-[180px]">{adminUser.email}</span>
            </div>

            <Link
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-1 text-xs font-mono text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted/40 transition-colors"
              title="View Public Storefront"
            >
              <span>Store</span>
              <ExternalLink className="size-3" />
            </Link>

            <form action={logoutAdminAction}>
              <Button
                variant="ghost"
                size="sm"
                type="submit"
                className="h-8 px-2.5 text-xs font-mono text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                title="End Staff Session"
              >
                <LogOut className="size-3.5 sm:mr-1" />
                <span className="hidden sm:inline">Logout</span>
              </Button>
            </form>
          </div>
        </div>
      </header>

      {/* Main Admin Content */}
      <main className="flex-1 container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}

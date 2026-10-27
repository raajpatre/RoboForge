"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useCart } from "@/context/cart-context";
import { ShoppingCart, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function Navbar() {
  const pathname = usePathname();
  const { totalCount, isHydrated } = useCart();

  // Hide the storefront navbar on all admin portal routes
  if (pathname?.startsWith("/admin")) {
    return null;
  }

  const navLinks = [
    { href: "/products", label: "Catalog" },
    { href: "/track", label: "Track Order" },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand / Logo */}
        <Link
          href="/"
          id="nav-brand-logo"
          className="flex items-center transition-transform hover:scale-[1.02]"
        >
          <Image
            src="/images/logo.png"
            alt="RoboForge Logo"
            width={164}
            height={35}
            priority
            className="h-9 w-auto object-contain"
          />
        </Link>

        {/* Navigation Links */}
        <nav className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm font-medium transition-colors hover:text-foreground ${
                  isActive ? "text-foreground font-semibold" : "text-muted-foreground"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Right Action Icons: Cart */}
        <div className="flex items-center gap-3">
          <Link
            href="/track"
            id="nav-track-link-mobile"
            className="md:hidden flex items-center justify-center p-2 text-muted-foreground hover:text-foreground"
            title="Track Order"
          >
            <Search className="size-5" />
          </Link>

          <Link
            href="/cart"
            id="nav-cart-button"
            className="relative flex items-center gap-2 rounded-lg border border-border/80 bg-card px-3.5 py-1.5 text-sm font-medium transition-all hover:border-foreground/30 hover:bg-muted/50"
          >
            <ShoppingCart className="size-4 text-foreground" />
            <span className="hidden sm:inline font-mono">Cart</span>
            {isHydrated && totalCount > 0 && (
              <Badge
                id="cart-badge-count"
                variant="default"
                className="ml-0.5 size-5 p-0 flex items-center justify-center text-[11px] font-mono font-bold"
              >
                {totalCount}
              </Badge>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}

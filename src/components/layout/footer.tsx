import Link from "next/link";
import Image from "next/image";
import { getBusinessConfig } from "@/lib/domain/business-config";

export function Footer() {
  const config = getBusinessConfig();

  return (
    <footer className="mt-auto border-t border-border/60 bg-muted/30">
      {/* Main Footer Info */}
      <div className="container mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-10">
          {/* Col 1: Brand & Description */}
          <div className="max-w-sm">
            <Link
              href="/"
              id="footer-brand-logo"
              className="inline-block transition-transform hover:scale-[1.02]"
            >
              <Image
                src="/images/logo.png"
                alt="RoboForge Logo"
                width={150}
                height={32}
                className="h-8 w-auto object-contain"
              />
            </Link>
            <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
              Engineered robotics platforms, LiDAR scanners, 6-DOF robotic arms, and industrial motor controllers for research labs, automation engineers, and aerospace developers.
            </p>
          </div>

          {/* Right Columns: Customer & Policies + Entity Details */}
          <div className="flex flex-col sm:flex-row gap-10 sm:gap-16 md:gap-24">
            {/* Customer & Policies */}
            <div>
              <h5 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                Customer & Policies
              </h5>
              <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
                <li>
                  <Link href="/terms" id="footer-link-terms" className="hover:text-foreground transition-colors">
                    Terms and Conditions
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" id="footer-link-privacy" className="hover:text-foreground transition-colors">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link href="/shipping-cancellation-refund-policy" id="footer-link-shipping-cancellation" className="hover:text-foreground transition-colors">
                    Shipping, Cancellation and Refund Policy
                  </Link>
                </li>
              </ul>
            </div>

            {/* Entity Details */}
            <div>
              <p className="text-xs font-semibold text-foreground">
                {config.legalName}
              </p>
              <div className="mt-3 text-xs text-muted-foreground space-y-1.5">
                <p className="leading-relaxed">
                  {config.operatingAddress.line1}
                  {config.operatingAddress.line2 && `, ${config.operatingAddress.line2}`}
                  <br />
                  {config.operatingAddress.city}, {config.operatingAddress.state} - {config.operatingAddress.postalCode}
                </p>
                <div className="pt-1 font-mono text-[11px] space-y-0.5">
                  <p>Support: {config.contactEmail}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-10 border-t border-border/40 pt-6 flex flex-col sm:flex-row items-center justify-between text-[11px] text-muted-foreground gap-4">
          <p>© {new Date().getFullYear()} {config.legalName}. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}

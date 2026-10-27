import type { Metadata } from "next";
import Link from "next/link";
import { getBusinessConfig } from "@/lib/domain/business-config";
import { Cpu, ShieldCheck, Truck, Scale, MapPin, Mail, Phone, Clock, AlertTriangle } from "lucide-react";

export const metadata: Metadata = {
  title: "About Us | RoboForge",
  description: "Learn about RoboForge: robotics and electronics components, microcontroller kits, and maker hardware operated from Bengaluru, India.",
};

export default function AboutPage() {
  const config = getBusinessConfig();

  return (
    <main className="container mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Test Mode / Launch Notice */}
      {config.isTestEnvironment && (
        <div
          id="test-mode-notice-about"
          className="mb-8 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-800 dark:text-amber-300"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="size-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div>
              <p className="font-semibold text-sm">Test Mode / Sandbox Environment</p>
              <p className="mt-1 leading-relaxed text-amber-700 dark:text-amber-300/90">
                This store is currently operating in <strong>Test / Sandbox Mode</strong>. Payments are processed in Razorpay test mode.
              </p>
              {config.unconfiguredItems.length > 0 && (
                <div className="mt-3">
                  <p className="font-semibold text-[11px] uppercase tracking-wider text-amber-900 dark:text-amber-200">
                    Configuration Required for Live Launch:
                  </p>
                  <ul className="mt-1.5 list-disc list-inside space-y-0.5 font-mono text-[11px]">
                    {config.unconfiguredItems.map((item: string, idx: number) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Hero Section */}
      <div className="mb-12 border-b border-border/60 pb-8">
        <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-primary font-bold">
          <Cpu className="size-4" /> Company Profile
        </div>
        <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mt-2">
          About {config.storeName}
        </h1>
        <p className="mt-4 text-base text-muted-foreground leading-relaxed max-w-3xl">
          RoboForge is a robotics and electronics hardware store operated by Raaj Patre from Bengaluru, Karnataka, India. We provide microcontrollers, sensor kits, motor controllers, and prototyping modules for builders, engineers, and robotics hobbyists across India.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
        {/* Identity & Legal Entity */}
        <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-xs">
          <div className="flex items-center gap-3 mb-4">
            <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Scale className="size-5" />
            </div>
            <h2 className="font-heading text-lg font-bold text-foreground">
              Entity Information
            </h2>
          </div>
          <dl className="space-y-3 text-xs font-mono">
            <div>
              <dt className="text-muted-foreground uppercase text-[10px]">Trade Name</dt>
              <dd className="font-semibold text-foreground text-sm">{config.tradeName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground uppercase text-[10px]">Legal Entity Name</dt>
              <dd className="font-medium text-foreground">{config.legalName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground uppercase text-[10px]">Operator</dt>
              <dd className="text-foreground">Raaj Patre</dd>
            </div>
            <div>
              <dt className="text-muted-foreground uppercase text-[10px]">Tax Registration</dt>
              <dd className="text-foreground">
                {config.taxMode.isGstRegistered ? (
                  <span className="text-emerald-500 font-semibold">GSTIN: {config.taxMode.gstin}</span>
                ) : (
                  <span className="text-muted-foreground">Unregistered Small Business (Below Turnover Threshold)</span>
                )}
              </dd>
            </div>
          </dl>
        </div>

        {/* Operating Address */}
        <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-xs">
          <div className="flex items-center gap-3 mb-4">
            <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <MapPin className="size-5" />
            </div>
            <h2 className="font-heading text-lg font-bold text-foreground">
              Principal Operating Address
            </h2>
          </div>
          <div className="text-xs leading-relaxed space-y-1 text-muted-foreground font-mono">
            <p className="text-foreground font-semibold">{config.legalName}</p>
            <p>{config.operatingAddress.line1}</p>
            {config.operatingAddress.line2 && <p>{config.operatingAddress.line2}</p>}
            <p>
              {config.operatingAddress.city}, {config.operatingAddress.state} - {config.operatingAddress.postalCode}
            </p>
            <p>{config.operatingAddress.country}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        {/* Contact Details */}
        <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 text-primary">
            <Mail className="size-4" />
            <h3 className="font-heading text-sm font-bold text-foreground">Support Email</h3>
          </div>
          <p className="text-xs font-mono text-muted-foreground">
            <a href={`mailto:${config.contactEmail}`} className="hover:text-primary transition-colors">
              {config.contactEmail}
            </a>
          </p>
        </div>

        <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 text-primary">
            <Phone className="size-4" />
            <h3 className="font-heading text-sm font-bold text-foreground">Support Phone</h3>
          </div>
          <p className="text-xs font-mono text-muted-foreground">
            <a href={`tel:${config.contactPhone}`} className="hover:text-primary transition-colors">
              {config.contactPhone}
            </a>
          </p>
        </div>

        <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 text-primary">
            <Clock className="size-4" />
            <h3 className="font-heading text-sm font-bold text-foreground">Operational Hours</h3>
          </div>
          <p className="text-xs font-mono text-muted-foreground">
            {config.supportHours}
          </p>
        </div>
      </div>

      {/* Logistics & Security Standards */}
      <div className="rounded-2xl border border-border/80 bg-muted/20 p-8 space-y-6">
        <h2 className="font-heading text-xl font-bold text-foreground">
          Logistics & Quality Guarantees
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-primary">
              <Truck className="size-4" />
              <span className="font-semibold text-xs text-foreground uppercase tracking-wider font-mono">
                Domestic Dispatch
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Dispatched within {config.shippingTimelines.processingDays} via {config.shippingTimelines.partners}. Delivery typically in {config.shippingTimelines.transitDays}.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-primary">
              <ShieldCheck className="size-4" />
              <span className="font-semibold text-xs text-foreground uppercase tracking-wider font-mono">
                Secure Payments
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              PCI-DSS compliant payments processed through Razorpay. We never see or store your payment card or banking information.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-primary">
              <Scale className="size-4" />
              <span className="font-semibold text-xs text-foreground uppercase tracking-wider font-mono">
                Fair Returns
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Transparent cancellation and refund turnaround of {config.refundTimelines.turnaroundDays} to the original payment source.
            </p>
          </div>
        </div>

        <div className="pt-4 border-t border-border/60 flex flex-wrap gap-4 text-xs font-mono">
          <Link href="/terms" className="text-primary hover:underline">
            Terms & Conditions &rarr;
          </Link>
          <Link href="/privacy" className="text-primary hover:underline">
            Privacy Policy &rarr;
          </Link>
          <Link href="/shipping-cancellation-refund-policy" className="text-primary hover:underline">
            Shipping, Cancellation & Refunds &rarr;
          </Link>
        </div>
      </div>
    </main>
  );
}

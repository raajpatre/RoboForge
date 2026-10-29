import type { Metadata } from "next";
import Link from "next/link";
import { Truck } from "lucide-react";

export const metadata: Metadata = {
  title: "Shipping, Cancellation and Refund Policy | RoboForge",
  description:
    "RoboForge Shipping, Cancellation and Refund Policy: Bangalore delivery timelines, order tracking, cancellation terms, and Razorpay refund procedures.",
};

export default function ShippingCancellationRefundPolicyPage() {
  return (
    <main className="container mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Header */}
      <section className="mb-10 pb-6 border-b border-border/60">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary mb-3">
          <Truck className="size-3.5" />
          <span>Fulfillment & Refund Standards</span>
        </div>
        <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
          Shipping, Cancellation and Refund Policy
        </h1>
        <p className="mt-2 text-xs sm:text-sm text-muted-foreground">
          Last updated: 29 October 2026
        </p>
      </section>

      {/* Policy Clauses */}
      <div className="space-y-8 text-xs sm:text-sm leading-relaxed text-muted-foreground">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-foreground mb-2">
            1. Shipping and delivery
          </h2>
          <ul className="list-disc list-inside space-y-1.5 pl-1">
            <li>
              <strong className="text-foreground">Serviceable Area:</strong> Currently we deliver in <strong>Bangalore, Karnataka only</strong>. We do not deliver to addresses outside Bangalore, outside Karnataka, or internationally at this time.
            </li>
            <li>We dispatch orders within 1 to 2 working days of a confirmed payment.</li>
            <li>
              Delivery in Bangalore usually takes 2 to 4 working days from the date of payment. This is an estimate and not a guarantee.
            </li>
            <li>
              Shipping charges: free on orders above ₹500; for orders of ₹500 or less, shipping charge is shown at checkout before you pay.
            </li>
            <li>
              We ship through local courier partners and India Post. Tracking details, where available, will be shared by email or SMS.
            </li>
            <li>Orders with several items may be shipped in separate packages.</li>
            <li>
              Please provide a complete and correct address in Bangalore and a reachable phone number. If delivery fails because of a wrong address or because you were unreachable, we may charge the re-shipping cost, or the order may be returned to us.
            </li>
            <li>
              If your order has not arrived within 10 days of payment, contact us at{" "}
              <a href="mailto:raajpatre023@gmail.com" className="font-mono text-primary hover:underline">
                raajpatre023@gmail.com
              </a>{" "}
              with your Order ID and we will investigate with the courier.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-base sm:text-lg font-bold text-foreground mb-2">
            2. Tracking your order
          </h2>
          <p>
            Enter your Order ID on our website to see your order&apos;s status. Keep it private, since anyone who has it can view the status.
          </p>
        </div>

        <div>
          <h2 className="text-base sm:text-lg font-bold text-foreground mb-2">
            3. Cancellation
          </h2>
          <ul className="list-disc list-inside space-y-1.5 pl-1">
            <li>
              Customers cannot cancel orders after they are placed. Please check your cart, product specifications and compatibility before paying.
            </li>
            <li>
              We may cancel an order if an item is out of stock, if there is a pricing or listing error, if the delivery address is outside our serviceable delivery area (Bangalore, Karnataka only), or if we suspect fraud. We will inform you by email, SMS or phone.
            </li>
            <li>
              If only some items in an order are unavailable, we may cancel those items and either ship the rest or cancel the whole order after checking with you. You get a refund for the cancelled items.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-base sm:text-lg font-bold text-foreground mb-2">
            4. Refunds
          </h2>
          <ul className="list-disc list-inside space-y-1.5 pl-1">
            <li>
              Refunds are made to your original payment method through Razorpay. We cannot refund to a different account or method.
            </li>
            <li>We initiate the refund as soon as the cancellation is confirmed.</li>
            <li>
              After we initiate it, the refund normally reaches your account in 5 to 7 working days. Some banks or card networks may take up to 10 working days.
            </li>
            <li>
              You will receive a refund confirmation from Razorpay on your email. If you have not received the money after 10 working days, write to us with your Order ID and we will help you trace it.
            </li>
            <li>
              For a partial cancellation, we refund the price of the cancelled items and any shipping charge attributable to them.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-base sm:text-lg font-bold text-foreground mb-2">
            5. Damaged, defective or wrong items
          </h2>
          <p className="mb-2">If your order arrives damaged, does not work, or is not what you ordered:</p>
          <ol className="list-decimal list-inside space-y-1.5 pl-1">
            <li>
              Contact us within 48 hours of delivery at{" "}
              <a href="mailto:raajpatre023@gmail.com" className="font-mono text-primary hover:underline">
                raajpatre023@gmail.com
              </a>{" "}
              or +91 9022327897.
            </li>
            <li>
              Share your Order ID and clear photos or an unboxing video showing the package, the shipping label and the problem.
            </li>
            <li>
              After verifying, we will send a replacement or issue a refund, depending on stock and the nature of the problem. We will confirm the next steps by email.
            </li>
          </ol>
          <p className="mt-3">
            We may ask you to return the item before a replacement or refund, at our cost. Items damaged through misuse, wrong wiring, wrong voltage, soldering or physical alteration are not covered.
          </p>
        </div>

        <div>
          <h2 className="text-base sm:text-lg font-bold text-foreground mb-2">
            6. What we do not accept
          </h2>
          <p>
            We do not accept returns or give refunds for change of mind, ordering the wrong item, or a part turning out to be unsuitable or incompatible with your project, as long as the product matches its listing.
          </p>
        </div>

        <div>
          <h2 className="text-base sm:text-lg font-bold text-foreground mb-2">
            7. Contact
          </h2>
          <div className="mt-3 rounded-xl border border-border/80 bg-card p-4 space-y-1.5 text-xs">
            <p>
              <span className="text-muted-foreground">Email:</span>{" "}
              <a href="mailto:raajpatre023@gmail.com" className="font-mono text-primary hover:underline">
                raajpatre023@gmail.com
              </a>
            </p>
            <p>
              <span className="text-muted-foreground">Address:</span>{" "}
              <span className="text-foreground">Sattva Global City, Rajarajeshwari Nagar, Bengaluru, Karnataka 560059</span>
            </p>
          </div>
        </div>
      </div>

      {/* Footer Navigation */}
      <div className="mt-12 pt-6 border-t border-border/60 flex flex-wrap gap-4 text-xs">
        <Link href="/terms" className="text-primary hover:underline">Terms and Conditions →</Link>
        <Link href="/privacy" className="text-primary hover:underline">Privacy Policy →</Link>
      </div>
    </main>
  );
}

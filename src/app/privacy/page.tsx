import type { Metadata } from "next";
import Link from "next/link";
import { Lock } from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy | RoboForge",
  description:
    "Privacy Policy for RoboForge: details on personal information collected, order fulfillment without accounts, zero PII public tracking, and user rights.",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="container mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Header */}
      <section className="mb-10 pb-6 border-b border-border/60">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary mb-3">
          <Lock className="size-3.5" />
          <span>Privacy & Data Protection</span>
        </div>
        <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
          Privacy Policy
        </h1>
        <p className="mt-2 text-xs sm:text-sm text-muted-foreground">
          Last updated: 18 October 2026
        </p>
        <p className="mt-4 text-xs sm:text-sm leading-relaxed text-muted-foreground">
          This policy explains what personal information RoboForge (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) collects when you use our website, why we collect it, and what you can do about it. By placing an order on our website, you agree to the practices described here.
        </p>
      </section>

      {/* Policy Clauses */}
      <div className="space-y-8 text-xs sm:text-sm leading-relaxed text-muted-foreground">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-foreground mb-2">
            1. Who we are
          </h2>
          <p>
            RoboForge is a small business operated by Raaj Patre from Bengaluru, Karnataka, India. For any privacy question, contact us at{" "}
            <a href="mailto:raajpatre023@gmail.com" className="font-mono text-primary hover:underline">
              raajpatre023@gmail.com
            </a>
            .
          </p>
        </div>

        <div>
          <h2 className="text-base sm:text-lg font-bold text-foreground mb-2">
            2. What we collect
          </h2>
          <p>
            You don&apos;t need an account to shop with us. We collect only what is needed to fulfil your order:
          </p>
          <ul className="mt-2 list-disc list-inside space-y-1.5 pl-1">
            <li>
              <strong className="text-foreground">Contact and delivery details:</strong> your name, phone number, email address and delivery address.
            </li>
            <li>
              <strong className="text-foreground">Order details:</strong> the items you ordered, order amount, Order ID and order status.
            </li>
            <li>
              <strong className="text-foreground">Payment status:</strong> payments are processed by Razorpay. We receive the payment status, payment ID and amount. We do not receive or store your card, UPI or bank details.
            </li>
            <li>
              <strong className="text-foreground">Messages:</strong> anything you send us when you contact support.
            </li>
            <li>
              <strong className="text-foreground">Technical data:</strong> We do not use analytics.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-base sm:text-lg font-bold text-foreground mb-2">
            3. How we use your information
          </h2>
          <ul className="list-disc list-inside space-y-1.5 pl-1">
            <li>To accept, process, dispatch and deliver your order</li>
            <li>To process refunds and handle damage, defect or wrong-item reports</li>
            <li>To answer your questions and resolve complaints</li>
            <li>To prevent fraud and misuse of our website</li>
            <li>To keep records we are legally required to keep</li>
            <li>To understand how the website is used and improve it</li>
          </ul>
          <p className="mt-3 font-medium text-foreground">
            We use your contact details for order-related communication only. We will not send you promotional messages.
          </p>
        </div>

        <div>
          <h2 className="text-base sm:text-lg font-bold text-foreground mb-2">
            4. Order tracking without an account
          </h2>
          <p>
            After you order, we give you an Order ID. You can view your order&apos;s status on our website by entering the Order ID. The tracking page shows only the order status and does not display your name, phone number, email address or delivery address. Please keep your Order ID private, since anyone who has it can view the order status.
          </p>
        </div>

        <div>
          <h2 className="text-base sm:text-lg font-bold text-foreground mb-2">
            5. Who we share it with
          </h2>
          <p>
            We do not sell or rent your personal information. We share it only with the following, and only as needed:
          </p>
          <ul className="mt-2 list-disc list-inside space-y-1.5 pl-1">
            <li>
              <strong className="text-foreground">Razorpay</strong>, our payment processor, to take payments and issue refunds, under its own privacy policy.
            </li>
            <li>
              <strong className="text-foreground">Courier and logistics partners (India Post)</strong>, who receive your name, phone number and delivery address to deliver your order.
            </li>
            <li>
              <strong className="text-foreground">Authorities</strong>, if required by law, court order or a valid government request.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-base sm:text-lg font-bold text-foreground mb-2">
            6. How long we keep your data
          </h2>
          <p>
            We keep order information for 1 year after your order, so we can handle returns, disputes and accounting. After that, we delete or anonymise it.
          </p>
        </div>

        <div>
          <h2 className="text-base sm:text-lg font-bold text-foreground mb-2">
            7. Security
          </h2>
          <p>
            We use reasonable safeguards, including encrypted connections (HTTPS) and restricted access to order data. No online system is completely secure, so we cannot guarantee absolute security.
          </p>
        </div>

        <div>
          <h2 className="text-base sm:text-lg font-bold text-foreground mb-2">
            8. Your rights
          </h2>
          <p>You may ask us to:</p>
          <ul className="mt-2 list-disc list-inside space-y-1.5 pl-1">
            <li>Tell you what personal information we hold about you</li>
            <li>Correct information that is wrong or incomplete</li>
            <li>Delete your information, except what we must keep for an open order or dispute</li>
            <li>Withdraw your consent to our use of your information</li>
          </ul>
          <p className="mt-3">
            Withdrawing consent while an order is pending may stop us from completing that order. To make a request, email{" "}
            <a href="mailto:raajpatre023@gmail.com" className="font-mono text-primary hover:underline">
              raajpatre023@gmail.com
            </a>{" "}
            from the address you used for the order. We may ask you to confirm your identity first. We will respond within 30 days.
          </p>
        </div>

        <div>
          <h2 className="text-base sm:text-lg font-bold text-foreground mb-2">
            9. Children
          </h2>
          <p>
            Our website is meant for adults aged 18 and above. If you are under 18, please have a parent or guardian place the order for you.
          </p>
        </div>

        <div>
          <h2 className="text-base sm:text-lg font-bold text-foreground mb-2">
            10. Changes to this policy
          </h2>
          <p>
            We may update this policy from time to time. The &ldquo;Last updated&rdquo; date above shows when it last changed. Continuing to use the website after an update means you accept the updated policy.
          </p>
        </div>

        <div>
          <h2 className="text-base sm:text-lg font-bold text-foreground mb-2">
            11. Grievance Officer
          </h2>
          <p>
            If you have a complaint about how we handle your information:
          </p>
          <div className="mt-3 rounded-xl border border-border/80 bg-card p-4 space-y-1.5 text-xs">
            <p><span className="text-muted-foreground">Name:</span> <strong className="text-foreground">Bikash Jha</strong></p>
            <p><span className="text-muted-foreground">Email:</span> <a href="mailto:bikjha2007@gmail.com" className="font-mono text-primary hover:underline">bikjha2007@gmail.com</a></p>
            <p><span className="text-muted-foreground">Address:</span> <span className="text-foreground">Sattva Global City, Rajarajeshwari Nagar, Bengaluru, Karnataka 560059</span></p>
          </div>
          <p className="mt-3">
            We will acknowledge your complaint within 72 hours and aim to resolve it within one month.
          </p>
        </div>
      </div>

      {/* Footer Navigation */}
      <div className="mt-12 pt-6 border-t border-border/60 flex flex-wrap gap-4 text-xs">
        <Link href="/terms" className="text-primary hover:underline">Terms and Conditions →</Link>
        <Link href="/shipping-cancellation-refund-policy" className="text-primary hover:underline">Shipping, Cancellation and Refund Policy →</Link>
      </div>
    </main>
  );
}

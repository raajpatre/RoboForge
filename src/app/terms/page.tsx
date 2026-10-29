import type { Metadata } from "next";
import Link from "next/link";
import { Scale } from "lucide-react";

export const metadata: Metadata = {
  title: "Terms and Conditions | RoboForge",
  description:
    "Terms and Conditions governing orders, component usage, delivery, pricing, and acceptable use on RoboForge.",
};

export default function TermsPage() {
  return (
    <main className="container mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Header */}
      <section className="mb-10 pb-6 border-b border-border/60">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary mb-3">
          <Scale className="size-3.5" />
          <span>Statutory Terms of Sale & Service</span>
        </div>
        <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
          Terms and Conditions
        </h1>
        <p className="mt-2 text-xs sm:text-sm text-muted-foreground">
          Last updated: 29 October 2026
        </p>
        <p className="mt-4 text-xs sm:text-sm leading-relaxed text-muted-foreground">
          These terms govern your use of our website and any order you place with RoboForge. By using the website or placing an order, you agree to these terms, our{" "}
          <Link href="/privacy" className="text-primary hover:underline font-medium">
            Privacy Policy
          </Link>
          , and our{" "}
          <Link href="/shipping-cancellation-refund-policy" className="text-primary hover:underline font-medium">
            Shipping, Cancellation and Refund Policy
          </Link>
          . If you do not agree, please do not use the website.
        </p>
      </section>

      {/* Terms Clauses */}
      <div className="space-y-8 text-xs sm:text-sm leading-relaxed text-muted-foreground">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-foreground mb-2">
            1. About RoboForge
          </h2>
          <p>
            RoboForge is a small business operated by Raaj Patre from Bengaluru, Karnataka, India. It sells robotics and electronics components online. Contact:{" "}
            <a href="mailto:raajpatre023@gmail.com" className="font-mono text-primary hover:underline">
              raajpatre023@gmail.com
            </a>
            , +91 9022327897.
          </p>
        </div>

        <div>
          <h2 className="text-base sm:text-lg font-bold text-foreground mb-2">
            2. Eligibility
          </h2>
          <p>
            You must be 18 or older to place an order. If you are under 18, a parent or guardian must place the order and accepts these terms on your behalf.
          </p>
        </div>

        <div>
          <h2 className="text-base sm:text-lg font-bold text-foreground mb-2">
            3. Products and information
          </h2>
          <ul className="list-disc list-inside space-y-1.5 pl-1">
            <li>
              We try to keep product descriptions, images and specifications accurate. Images are for illustration, and minor differences in appearance, colour or packaging can occur.
            </li>
            <li>
              Our products are electronic components intended for learning, hobby, prototyping and general project use. Check the specifications and compatibility of a part with your project before ordering.
            </li>
            <li>
              Do not use our products in safety-critical applications (such as medical devices, vehicles carrying people, or life-support systems) unless you have independently validated them for that use.
            </li>
            <li>
              Electronics can be damaged by wrong wiring, wrong voltage or static discharge. You are responsible for handling and using the components safely.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-base sm:text-lg font-bold text-foreground mb-2">
            4. Placing an order
          </h2>
          <ul className="list-disc list-inside space-y-1.5 pl-1">
            <li>
              You do not need an account. You provide your name, phone number, email address and delivery address at checkout. Please make sure they are correct, because we use them to deliver and to contact you.
            </li>
            <li>
              <strong className="text-foreground">Serviceable Area:</strong> Currently we deliver in <strong>Bangalore, Karnataka only</strong>. We do not accept orders or ship to locations outside Bangalore or outside Karnataka at this time.
            </li>
            <li>
              Your order is confirmed only after payment is successful and you receive an Order ID.
            </li>
            <li>
              We may decline or cancel an order if there is a pricing or listing error, if an item is out of stock, if we suspect fraud or misuse, or if the delivery address is outside our serviceable delivery area (Bangalore, Karnataka only). In such cases you will receive a full refund of the amount paid for the affected items.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-base sm:text-lg font-bold text-foreground mb-2">
            5. Prices and payment
          </h2>
          <ul className="list-disc list-inside space-y-1.5 pl-1">
            <li>
              All prices are in Indian Rupees (INR) and shown on the product page and at checkout. Shipping is free on orders above ₹500. For smaller orders, the shipping charge is shown at checkout before you pay.
            </li>
            <li>
              RoboForge is not registered under GST, so no GST is charged on your order.
            </li>
            <li>
              Payments are processed securely by Razorpay. The payment methods you see at checkout depend on Razorpay. We do not see or store your card, UPI or bank details.
            </li>
            <li>
              If money is deducted from your account but you do not receive an Order ID, email us at{" "}
              <a href="mailto:raajpatre023@gmail.com" className="font-mono text-primary hover:underline">
                raajpatre023@gmail.com
              </a>{" "}
              with your payment details. We will confirm the order or refund the amount.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-base sm:text-lg font-bold text-foreground mb-2">
            6. Order tracking
          </h2>
          <p>
            You can check your order status on our website using your Order ID. Keep your Order ID private. Status updates may take some time to reflect after a courier update.
          </p>
        </div>

        <div>
          <h2 className="text-base sm:text-lg font-bold text-foreground mb-2">
            7. Shipping and delivery
          </h2>
          <p>
            We fulfill orders and deliver exclusively to addresses within Bangalore, Karnataka. Orders are usually delivered within 2 to 4 working days of payment. These are estimates, not guarantees. Delays can happen due to courier issues, weather, local restrictions or stock availability.
          </p>
        </div>

        <div>
          <h2 className="text-base sm:text-lg font-bold text-foreground mb-2">
            8. Cancellations and refunds
          </h2>
          <ul className="list-disc list-inside space-y-1.5 pl-1">
            <li>Orders cannot be cancelled by customers once placed.</li>
            <li>
              If an item is out of stock, we may cancel the affected order or item and refund the amount paid through Razorpay, to the original payment method.
            </li>
            <li>
              Damaged, defective or wrong items must be reported with proof upon receipt for resolution or replacement.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-base sm:text-lg font-bold text-foreground mb-2">
            9. Acceptable use
          </h2>
          <p>
            You agree not to misuse the website. That includes trying to access other people&apos;s orders or data, interfering with the site&apos;s security or operation, using automated tools to scrape or overload it, placing fraudulent orders, or using it for any unlawful purpose.
          </p>
        </div>

        <div>
          <h2 className="text-base sm:text-lg font-bold text-foreground mb-2">
            10. Intellectual property
          </h2>
          <p>
            The RoboForge name, logo, website design and our original content belong to us. Product names, brand names and trademarks such as Arduino and ESP32 belong to their respective owners and are used only to identify the products we sell. You may not copy or reuse our content without written permission.
          </p>
        </div>

        <div>
          <h2 className="text-base sm:text-lg font-bold text-foreground mb-2">
            11. Disclaimer and limitation of liability
          </h2>
          <ul className="list-disc list-inside space-y-1.5 pl-1">
            <li>
              Products are supplied with the manufacturer&apos;s specifications. We do not promise that any product will suit your specific purpose.
            </li>
            <li>
              To the extent permitted by law, RoboForge is not liable for indirect or consequential loss, loss of data or profit, or damage caused by misuse, incorrect wiring, wrong voltage or unsuitable applications.
            </li>
            <li>
              To the extent permitted by law, our total liability for any claim relating to an order is limited to the amount you paid for that order.
            </li>
            <li>
              Nothing in these terms limits any right you have under Indian consumer protection law that cannot be excluded.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-base sm:text-lg font-bold text-foreground mb-2">
            12. Events beyond our control
          </h2>
          <p>
            We are not responsible for delay or failure caused by events beyond our reasonable control, such as natural disasters, strikes, courier disruption, supplier shortages, internet or payment gateway outages, or government restrictions.
          </p>
        </div>

        <div>
          <h2 className="text-base sm:text-lg font-bold text-foreground mb-2">
            13. Changes to these terms
          </h2>
          <p>
            We may update these terms. The version published on the website when you place your order applies to that order.
          </p>
        </div>

        <div>
          <h2 className="text-base sm:text-lg font-bold text-foreground mb-2">
            14. Contact and grievances
          </h2>
          <div className="mt-3 rounded-xl border border-border/80 bg-card p-4 space-y-1.5 text-xs">
            <p><span className="text-muted-foreground">Grievance Officer:</span> <strong className="text-foreground">Bikash Jha</strong></p>
            <p><span className="text-muted-foreground">Email:</span> <a href="mailto:bikjha2007@gmail.com" className="font-mono text-primary hover:underline">bikjha2007@gmail.com</a></p>
            <p><span className="text-muted-foreground">Address:</span> <span className="text-foreground">Sattva Global City, Rajarajeshwari Nagar, Bengaluru, Karnataka 560059</span></p>
          </div>
          <p className="mt-3">
            We will acknowledge complaints within 72 hours and aim to resolve them within one month.
          </p>
        </div>
      </div>

      {/* Footer Navigation */}
      <div className="mt-12 pt-6 border-t border-border/60 flex flex-wrap gap-4 text-xs">
        <Link href="/privacy" className="text-primary hover:underline">Privacy Policy →</Link>
        <Link href="/shipping-cancellation-refund-policy" className="text-primary hover:underline">Shipping, Cancellation and Refund Policy →</Link>
      </div>
    </main>
  );
}

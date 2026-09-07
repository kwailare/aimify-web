import type { Metadata } from "next";
import { MarketingShell } from "@/components/marketing-shell";

export const metadata: Metadata = {
  title: "Privacy Policy | Aimify",
  description: "How Aimify collects, uses and protects your data.",
};

export default function PrivacyPage() {
  return (
    <MarketingShell>
      <section className="body-panel content-panel w-full p-7 sm:p-12 lg:p-16">
        <div>
          <p className="body-kicker text-xs font-bold uppercase tracking-[0.28em]">
            Legal
          </p>
          <h1 className="body-title mt-3 max-w-2xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
            Privacy Policy
          </h1>
          <p className="legal-meta">Last updated: September 2026</p>
        </div>

        <div className="legal-content">
          <div className="legal-section">
            <h2>1. What we collect</h2>
            <p>
              To provide Aimify, we collect account information (name,
              email, phone), organization details (company name, industry,
              warehouse locations), and the business data you enter into the
              platform — products, inventory movements, purchases, sales,
              customers, suppliers and expenses. We also collect basic
              usage data (login times, feature usage) to keep the service
              reliable and to improve it.
            </p>
          </div>

          <div className="legal-section">
            <h2>2. How we use your data</h2>
            <p>We use the data you provide to:</p>
            <ul>
              <li>Operate your account and your organization&apos;s workspace</li>
              <li>Send transactional alerts — low stock, payment reminders, subscription notices — by email and WhatsApp</li>
              <li>Process subscription payments through our payment providers</li>
              <li>Maintain the audit trail your business relies on for every stock and financial transaction</li>
              <li>Diagnose issues and improve the platform</li>
            </ul>
            <p>
              We do not sell your business data. It is not shared with
              other Aimify organizations except where you explicitly opt
              into a feature that does so (such as an inter-business
              marketplace, if and when enabled for your account).
            </p>
          </div>

          <div className="legal-section">
            <h2>3. Tenant isolation</h2>
            <p>
              Aimify is multi-tenant: many organizations share one
              platform, but each operates in a logically isolated
              environment. Every record in the system is tied to your
              organization, and access controls prevent one organization
              from viewing another&apos;s data.
            </p>
          </div>

          <div className="legal-section">
            <h2>4. Third-party services</h2>
            <p>
              We use third-party providers to operate Aimify, including
              payment processors (such as Paystack and Flutterwave) for
              billing, and messaging providers for WhatsApp and email
              notifications. These providers process only the data
              necessary to perform their function — for example, a payment
              provider receives billing details, not your inventory
              records.
            </p>
          </div>

          <div className="legal-section">
            <h2>5. Data retention</h2>
            <p>
              We retain your organization&apos;s data for as long as your
              account is active. If you cancel your subscription, we
              retain data for a limited period in case you reactivate,
              after which it is deleted, except where we&apos;re required
              to retain records for legal or accounting reasons.
            </p>
          </div>

          <div className="legal-section">
            <h2>6. Your rights</h2>
            <p>
              You can access, correct, or request deletion of your account
              data at any time from your account settings, or by
              contacting us directly. Organization owners can export their
              full transaction history on request.
            </p>
          </div>

          <div className="legal-section">
            <h2>7. Contact</h2>
            <p>
              Questions about this policy or your data can be sent to{" "}
              <a href="mailto:hello@aimify.com">hello@aimify.com</a>.
            </p>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}

import type { Metadata } from "next";
import { MarketingShell } from "@/components/marketing-shell";

export const metadata: Metadata = {
  title: "Terms of Service | Aimify",
  description: "The terms that govern your use of Aimify.",
};

export default function TermsPage() {
  return (
    <MarketingShell>
      <section className="body-panel content-panel w-full p-7 sm:p-12 lg:p-16">
        <div>
          <p className="body-kicker text-xs font-bold uppercase tracking-[0.28em]">
            Legal
          </p>
          <h1 className="body-title mt-3 max-w-2xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
            Terms of Service
          </h1>
          <p className="legal-meta">Last updated: 26 September 2026</p>
        </div>

        <div className="legal-content">
          <div className="legal-section">
            <h2>1. Your account</h2>
            <p>
              When you sign up, you create an organization and become its
              first Owner. You&apos;re responsible for the accuracy of the
              information you provide and for who you invite into your
              organization and what roles you grant them. You must be
              authorized to act on behalf of the business you register.
            </p>
            <p>
              You&apos;re also responsible for keeping your sign-in details
              secure and for activity that happens under your account. If you
              think someone else has access, change your password, which signs
              out every other device, and tell us.
            </p>
          </div>

          <div className="legal-section">
            <h2>2. Team members and roles</h2>
            <p>
              Owners and Administrators can invite people by email, change
              their roles and remove them. Each role limits what a person can
              do in your organization, and you are responsible for the roles
              you assign. The organization is responsible for the actions its
              team members take, and for removing people who should no longer
              have access. Removing someone signs them out of their devices.
            </p>
          </div>

          <div className="legal-section">
            <h2>3. Subscription, plans and billing</h2>
            <p>
              Aimify is offered as a subscription. New organizations start
              with a 14-day free trial — no card required to begin. After
              the trial, continued use requires an active paid
              subscription, billed monthly in advance. When a trial ends or a
              subscription is cancelled or suspended, the desktop app and
              dashboard are locked until it is active again; your data is
              kept, not deleted. The plan you&apos;re on sets limits such as
              the number of team members, active warehouses and active
              products, and you can&apos;t add more once a limit is reached.
              An Owner can cancel at any time from Billing; your access
              continues until the end of the period you&apos;ve already paid
              for.
            </p>
            <p>
              Prices are shown at signup and on the Pricing page. We&apos;ll
              give you advance notice of any price change before it
              applies to your account. Until online payments are available,
              subscriptions are activated by the Aimify team on request.
            </p>
          </div>

          <div className="legal-section">
            <h2>4. Acceptable use</h2>
            <p>You agree not to:</p>
            <ul>
              <li>Use Aimify for any unlawful purpose or to store data you don&apos;t have the right to hold</li>
              <li>Attempt to access another organization&apos;s data or bypass tenant isolation</li>
              <li>Reverse engineer, resell, or white-label the platform without our agreement</li>
              <li>Interfere with the platform&apos;s availability or security for other users</li>
              <li>Share your sign-in with people outside your organization, or use another person&apos;s account without permission</li>
            </ul>
          </div>

          <div className="legal-section">
            <h2>5. Your data, your business</h2>
            <p>
              The inventory, sales, customer and financial data you enter
              belongs to you. We don&apos;t claim ownership of it, and we
              don&apos;t use it to compete with you. You can ask us for an
              export of your data at any time, and it remains available to
              you for a reasonable period after cancellation. How we handle
              personal data is described in our Privacy Policy.
            </p>
          </div>

          <div className="legal-section">
            <h2>6. Service availability</h2>
            <p>
              We work to keep Aimify available and reliable, but we
              don&apos;t guarantee uninterrupted access. Planned
              maintenance and unplanned incidents can occasionally affect
              availability. We&apos;ll communicate significant outages
              through the notifications channel on your account.
            </p>
          </div>

          <div className="legal-section">
            <h2>7. Limitation of liability</h2>
            <p>
              Aimify is provided on an &quot;as is&quot; basis. To the
              extent permitted by law, we aren&apos;t liable for indirect
              or consequential losses arising from your use of the
              platform. Nothing in these terms limits liability that
              cannot be excluded under applicable law.
            </p>
          </div>

          <div className="legal-section">
            <h2>8. Termination</h2>
            <p>
              You may cancel your subscription at any time. We may suspend
              or terminate accounts that violate these terms, with notice
              where practical. On termination, your data is retained for a
              limited period per our Privacy Policy before deletion.
            </p>
          </div>

          <div className="legal-section">
            <h2>9. Changes to these terms</h2>
            <p>
              We may update these terms as the platform evolves. We&apos;ll
              notify active organizations of material changes before they
              take effect.
            </p>
          </div>

          <div className="legal-section">
            <h2>10. Contact</h2>
            <p>
              Questions about these terms can be sent to{" "}
              <a href="mailto:info@aimify.app">info@aimify.app</a>.
            </p>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}

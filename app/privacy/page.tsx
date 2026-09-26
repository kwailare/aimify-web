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
          <p className="legal-meta">Last updated: 26 September 2026</p>
        </div>

        <div className="legal-content">
          <div className="legal-section">
            <h2>1. What we collect</h2>
            <p>To provide Aimify, we collect:</p>
            <ul>
              <li>
                <strong>Account information:</strong> your name, email
                address, phone number and a password, which we store only as
                a one-way hash, never in plain text.
              </li>
              <li>
                <strong>Organization details:</strong> company name, industry,
                registration number, address, contact details, tax settings,
                warehouse details and your company logo.
              </li>
              <li>
                <strong>Team information:</strong> the people you invite, the
                email addresses you invite them at, and the role each person
                holds.
              </li>
              <li>
                <strong>Business data</strong> you or your team enter through
                the Aimify desktop app and website: products, product images,
                categories, warehouses and stock movements, and any further
                records such as sales, purchases, customers, suppliers and
                expenses as those modules become available.
              </li>
              <li>
                <strong>Sign-in and device information:</strong> each time
                someone signs in to the website or the desktop app we record
                the device or browser, the IP address, and when the session
                was created and last used.
              </li>
              <li>
                <strong>Activity records:</strong> an audit trail of important
                actions in your organization, such as sign-ins, profile and
                settings changes, team changes and stock movements. Each
                entry records who did it, when, what changed, and the IP
                address and device it came from.
              </li>
              <li>
                <strong>Two-factor data</strong>, if you turn it on: an
                encrypted authenticator key and hashed one-time backup codes.
                We can&apos;t read your backup codes after you create them.
              </li>
              <li>
                <strong>Security records:</strong> short-lived records of
                sign-in and password-reset attempts (by IP address and email),
                used to block repeated guessing.
              </li>
            </ul>
          </div>

          <div className="legal-section">
            <h2>2. How we use your data</h2>
            <p>We use the data above to:</p>
            <ul>
              <li>Operate your account and your organization&apos;s workspace</li>
              <li>Confirm your email address and send account emails such as invitations and password resets</li>
              <li>Send operational emails: low-stock and out-of-stock alerts, trial reminders, and notices when your subscription changes</li>
              <li>Keep the audit trail your business relies on for stock and account activity</li>
              <li>Protect accounts: limit repeated sign-in attempts and let you see and end active sessions</li>
              <li>Diagnose problems and improve the platform</li>
              <li>Process subscription payments, once online payments are enabled</li>
            </ul>
            <p>
              We do not sell your business data. It is not shared with other
              Aimify organizations except where you explicitly opt into a
              feature that does so (such as an inter-business marketplace, if
              and when enabled for your account).
            </p>
          </div>

          <div className="legal-section">
            <h2>3. Who can see your data</h2>
            <p>
              Aimify is multi-tenant: many organizations share one platform,
              but each operates in a logically isolated environment. Every
              record is tied to your organization, and access controls prevent
              one organization from viewing another&apos;s data.
            </p>
            <p>
              Inside your organization, what people can see and change
              depends on their role. Owners and Administrators can manage the
              team, see members&apos; names, email addresses and phone
              numbers, and edit organization settings. Other roles work with
              stock and records according to the permissions their role
              grants.
            </p>
            <p>
              A small number of Aimify staff act as platform administrators.
              They can see account, organization and activity information,
              including the IP address and device recorded in the audit trail,
              to provide support, keep the service secure and manage
              subscriptions. Their actions are recorded in the same audit
              trail.
            </p>
          </div>

          <div className="legal-section">
            <h2>4. Sessions, devices and account security</h2>
            <p>
              Every sign-in creates a session that you can review under
              Settings, in a list of signed-in devices. You can sign out any
              device, or all other devices, at any time. Changing or resetting
              your password signs out every other device, and so does being
              removed from an organization&apos;s team. Sessions expire after
              30 days.
            </p>
            <p>
              You can also turn on two-factor authentication in Settings, which
              asks for a code from an authenticator app each time you sign in
              to the website or the desktop app. We email you when it is turned
              on or off. Please keep your password private, use a password you
              don&apos;t use elsewhere, and sign out of shared computers.
            </p>
          </div>

          <div className="legal-section">
            <h2>5. Third-party services</h2>
            <p>
              We use trusted providers to run Aimify, and each receives only
              the data it needs to do its job:
            </p>
            <ul>
              <li>Vercel, to host the website and the desktop app&apos;s API, and to store uploaded images (company logos and product pictures)</li>
              <li>Neon, which provides the database that holds your account and business data</li>
              <li>Resend, to deliver the emails described above</li>
            </ul>
            <p>
              When online payments are enabled, a payment processor (such as
              Paystack or Flutterwave) will receive the billing details needed
              to take payment, but not your inventory records. If we add
              messaging channels such as WhatsApp for alerts, the messaging
              provider will receive only what is needed to deliver each
              message. We will update this policy before either is switched
              on.
            </p>
          </div>

          <div className="legal-section">
            <h2>6. Data retention</h2>
            <p>
              We retain your organization&apos;s data for as long as your
              account is active. If you cancel your subscription, we retain
              your data for a limited period in case you reactivate, after
              which it is deleted, except where we&apos;re required to keep
              records for legal or accounting reasons.
            </p>
            <p>
              Sign-in session records are removed about 30 days after they
              expire or are signed out. Activity records are kept as part of
              your audit trail; a platform administrator can clear older
              entries to save space, and every such clearing is itself
              recorded.
            </p>
          </div>

          <div className="legal-section">
            <h2>7. Your rights</h2>
            <p>
              You can correct your name and phone number yourself under
              Settings, and your organization&apos;s details under
              Organization. You can ask us for a copy of your data, to correct
              something you can&apos;t change yourself, or to delete your
              account, by contacting us. Organization owners can also request
              an export of their organization&apos;s records.
            </p>
          </div>

          <div className="legal-section">
            <h2>8. Changes to this policy</h2>
            <p>
              We may update this policy as Aimify grows and adds features. The
              date at the top shows when it last changed, and we&apos;ll
              notify active organizations of material changes before they
              take effect.
            </p>
          </div>

          <div className="legal-section">
            <h2>9. Contact</h2>
            <p>
              Questions about this policy or your data can be sent to{" "}
              <a href="mailto:info@aimify.app">info@aimify.app</a>.
            </p>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}

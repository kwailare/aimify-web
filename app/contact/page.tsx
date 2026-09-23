import type { Metadata } from "next";
import { Clock, Mail, MessageCircle } from "lucide-react";
import { ContactForm } from "@/components/contact-form";
import { MarketingShell } from "@/components/marketing-shell";

export const metadata: Metadata = {
  title: "Contact Aimify | Aimify",
  description:
    "Get in touch with the Aimify team — questions about the platform, pricing, or your account.",
};

export default function ContactPage() {
  return (
    <MarketingShell>
      <section className="body-panel content-panel w-full p-7 sm:p-12 lg:p-16">
        <div>
          <p className="body-kicker text-xs font-bold uppercase tracking-[0.28em]">
            Contact us
          </p>
          <h1 className="body-title mt-3 max-w-2xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
            Let&apos;s talk about your business.
          </h1>
          <p className="body-copy content-lede mt-6 text-base leading-7 sm:text-lg">
            Questions about pricing, a demo request, or already a customer
            and need a hand — reach out and we&apos;ll get back to you.
          </p>
        </div>

        <div className="contact-grid">
          <div className="contact-info-list">
            <div className="contact-info-item">
              <span className="contact-info-icon" aria-hidden="true">
                <Mail size={18} />
              </span>
              <div>
                <h3>Email</h3>
                <a href="mailto:info@aimify.app">info@aimify.app</a>
              </div>
            </div>
            <div className="contact-info-item">
              <span className="contact-info-icon" aria-hidden="true">
                <MessageCircle size={18} />
              </span>
              <div>
                <h3>WhatsApp</h3>
                <p>Message us on WhatsApp — same channel your alerts arrive on.</p>
              </div>
            </div>
            <div className="contact-info-item">
              <span className="contact-info-icon" aria-hidden="true">
                <Clock size={18} />
              </span>
              <div>
                <h3>Response time</h3>
                <p>We typically reply within one business day.</p>
              </div>
            </div>
          </div>

          <ContactForm />
        </div>
      </section>
    </MarketingShell>
  );
}

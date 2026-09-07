import type { Metadata } from "next";
import { ArrowUpRight, Clock, Mail, MessageCircle } from "lucide-react";
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
                <a href="mailto:hello@aimify.com">hello@aimify.com</a>
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

          <form className="contact-form" action="#">
            <div className="auth-form">
              <div className="auth-field-row">
                <div className="auth-field">
                  <label className="auth-label" htmlFor="contact-name">
                    Full name
                  </label>
                  <input
                    className="auth-input"
                    id="contact-name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    placeholder="Ada Obi"
                    required
                  />
                </div>
                <div className="auth-field">
                  <label className="auth-label" htmlFor="contact-email">
                    Work email
                  </label>
                  <input
                    className="auth-input"
                    id="contact-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@company.com"
                    required
                  />
                </div>
              </div>
              <div className="auth-field">
                <label className="auth-label" htmlFor="contact-subject">
                  Subject
                </label>
                <input
                  className="auth-input"
                  id="contact-subject"
                  name="subject"
                  type="text"
                  placeholder="What's this about?"
                  required
                />
              </div>
              <div className="auth-field">
                <label className="auth-label" htmlFor="contact-message">
                  Message
                </label>
                <textarea
                  className="auth-input"
                  id="contact-message"
                  name="message"
                  rows={5}
                  placeholder="Tell us a bit about your business and what you need."
                  required
                />
              </div>
              <button className="auth-submit" type="submit">
                Send message
                <ArrowUpRight size={16} aria-hidden="true" />
              </button>
            </div>
          </form>
        </div>
      </section>
    </MarketingShell>
  );
}

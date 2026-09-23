"use client";

import { ArrowUpRight, MailCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { sendContactMessageAction } from "@/lib/actions/contact";

export function ContactForm() {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsPending(true);

    const formData = new FormData(event.currentTarget);
    const result = await sendContactMessageAction(formData);

    setIsPending(false);

    if (result?.error) {
      setError(result.error);
      return;
    }

    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="auth-confirmation">
        <span className="auth-confirmation-icon" aria-hidden="true">
          <MailCheck size={22} strokeWidth={1.8} />
        </span>
        <p>
          Thanks for reaching out — we&apos;ve received your message and
          will reply within one business day.
        </p>
      </div>
    );
  }

  return (
    <form className="contact-form" onSubmit={handleSubmit}>
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
        {error && <p className="auth-error">{error}</p>}
        <button className="auth-submit" type="submit" disabled={isPending}>
          {isPending ? "Sending…" : "Send message"}
          <ArrowUpRight size={16} aria-hidden="true" />
        </button>
      </div>
    </form>
  );
}

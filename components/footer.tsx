import { ArrowUpRight, Mail } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

const productLinks = [
  { label: "Overview", href: "/#focus" },
  { label: "Features", href: "/#features" },
  { label: "How it works", href: "/#method" },
  { label: "Pricing", href: "/#pricing" },
];

const companyLinks = [
  { label: "About Aimify", href: "/about" },
  { label: "Contact", href: "/contact" },
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
];

export function Footer() {
  return (
    <footer className="footer-panel w-full px-7 pb-6 pt-12 sm:px-12 lg:px-16">
      <div className="footer-main">
        <div className="footer-brand max-w-sm">
          <Link className="footer-logo-link" href="/#top">
            <Image
              className="footer-logo"
              src="/assets/image/logo.png"
              alt="Aimify"
              width={48}
              height={48}
            />
            <span>Aimify</span>
          </Link>
          <p>
            One secure, auditable platform for inventory, sales, purchases
            and credit — built for wholesalers, distributors and retailers.
          </p>
          <a className="footer-email" href="mailto:hello@aimify.com">
            <Mail size={15} aria-hidden="true" />
            hello@aimify.com
          </a>
        </div>
        <div className="footer-links-group">
          <h2>Product</h2>
          <nav aria-label="Product links">
            {productLinks.map((link) => (
              <Link href={link.href} key={link.href}>
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="footer-links-group">
          <h2>Company</h2>
          <nav aria-label="Company links">
            {companyLinks.map((link) => (
              <Link href={link.href} key={link.href}>
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="footer-cta">
          <p>Ready to replace the spreadsheets?</p>
          <Link className="footer-action" href="/signup">
            Get started
            <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© 2026 Aimify Group. All rights reserved.</span>
        <span>Multi-tenant inventory management, built for growing businesses.</span>
      </div>
    </footer>
  );
}

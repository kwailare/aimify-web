import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// No nonce-based CSP here on purpose: Next.js's nonce mechanism requires
// every page to be dynamically rendered (no static generation, no PPR),
// since a nonce is per-request and static pages are built once at build
// time with none of the surrounding request context. This site is mostly
// static marketing pages by design (see the route table in `next build`
// output), so trading that away just to drop 'unsafe-inline' isn't worth
// it -- this matches the "Without Nonces" path Next's own CSP guide
// documents for exactly this situation. The app has no external scripts,
// images, or fetches (fonts are self-hosted via next/font, verified by
// grepping for any googleapis/gstatic/other external domain reference and
// finding none), so the policy below is otherwise as strict as it can be.
const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""};
  style-src 'self' 'unsafe-inline';
  img-src 'self' blob: data: https://*.public.blob.vercel-storage.com;
  font-src 'self';
  connect-src 'self';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests;
`;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "3mb",
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: cspHeader.replace(/\n/g, ""),
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
          },
          // Strict-Transport-Security is already set by Vercel's edge
          // network for every deployment, so it's deliberately not
          // duplicated here.
        ],
      },
    ];
  },
};

export default nextConfig;

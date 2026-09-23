import type { MetadataRoute } from "next";

const SITE_URL = "https://www.aimify.app";

export default function robots(): MetadataRoute.Robots {
  // While the pre-launch gate is on (see proxy.ts), every route serves the
  // same coming-soon content to anyone without the bypass cookie -- a
  // crawler included. Disallowing everything here stops search engines
  // indexing dozens of URLs as duplicate coming-soon content before
  // there's a real site behind them. This flips back automatically the
  // moment LAUNCH_GATE_ENABLED comes off, no separate step to remember on
  // launch day.
  if (process.env.LAUNCH_GATE_ENABLED === "true") {
    return {
      rules: {
        userAgent: "*",
        disallow: "/",
      },
    };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/dashboard",
        "/admin",
        "/onboarding",
        "/account-suspended",
        "/api",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}

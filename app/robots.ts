import type { MetadataRoute } from "next";

const SITE_URL = "https://www.aimify.app";

export default function robots(): MetadataRoute.Robots {
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
        "/reset-password",
        "/verify-email",
        "/api",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}

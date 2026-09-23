import { NextResponse } from "next/server";
import { auth } from "@/auth";

const PREVIEW_COOKIE = "aimify_preview";

function launchGateIsOn() {
  return process.env.LAUNCH_GATE_ENABLED === "true";
}

export default auth((req) => {
  const { pathname, searchParams } = req.nextUrl;

  // --- Pre-launch gate ---------------------------------------------------
  // Shows /coming-soon to every visitor except whoever holds the developer
  // bypass cookie. Fully inert unless LAUNCH_GATE_ENABLED="true" is set, so
  // local dev and ordinary preview deploys are never gated by accident --
  // flip that env var on when it's time for the public to see the
  // countdown instead of the real site.
  if (launchGateIsOn() && pathname !== "/coming-soon") {
    const bypassSecret = process.env.LAUNCH_GATE_BYPASS_SECRET;
    const previewParam = searchParams.get("preview");
    const hasValidCookie =
      !!bypassSecret && req.cookies.get(PREVIEW_COOKIE)?.value === bypassSecret;

    if (bypassSecret && previewParam === bypassSecret) {
      // Visiting .../?preview=<secret> once sets a long-lived cookie, then
      // continues on to the page actually requested with the secret
      // stripped out of the URL so it doesn't linger in the address bar or
      // browser history.
      const cleanUrl = new URL(req.nextUrl);
      cleanUrl.searchParams.delete("preview");
      const res = NextResponse.redirect(cleanUrl);
      res.cookies.set(PREVIEW_COOKIE, bypassSecret, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 90,
        path: "/",
      });
      return res;
    }

    if (!hasValidCookie) {
      return NextResponse.rewrite(new URL("/coming-soon", req.nextUrl));
    }
  }

  // --- Existing auth gate for the protected app ---------------------------
  if (
    (pathname.startsWith("/dashboard") || pathname.startsWith("/admin")) &&
    !req.auth
  ) {
    return NextResponse.redirect(new URL("/signin", req.nextUrl));
  }
});

export const config = {
  // Everything except API routes, Next's own static/image assets, and any
  // path with a file extension (public/ assets: icon.png, wordmark PNGs,
  // fonts, etc.) -- those must never be rewritten to /coming-soon or they'd
  // break the coming-soon page's own images along with everything else.
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};

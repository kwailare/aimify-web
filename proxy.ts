import { NextResponse } from "next/server";
import { auth } from "@/auth";

const PREVIEW_COOKIE = "aimify_preview";

function launchGateIsOn() {
  return process.env.LAUNCH_GATE_ENABLED === "true";
}

export default auth((req) => {
  const { pathname, searchParams } = req.nextUrl;

  if (launchGateIsOn() && pathname !== "/coming-soon") {
    const bypassSecret = process.env.LAUNCH_GATE_BYPASS_SECRET;
    const previewParam = searchParams.get("preview");
    const hasValidCookie =
      !!bypassSecret && req.cookies.get(PREVIEW_COOKIE)?.value === bypassSecret;

    if (bypassSecret && previewParam === bypassSecret) {
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

  if (
    (pathname.startsWith("/dashboard") || pathname.startsWith("/admin")) &&
    !req.auth
  ) {
    return NextResponse.redirect(new URL("/signin", req.nextUrl));
  }
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};

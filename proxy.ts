import { NextResponse } from "next/server";
import { auth } from "@/auth";

const PREVIEW_COOKIE = "aimify_preview";

function launchGateIsOn() {
  return process.env.LAUNCH_GATE_ENABLED === "true";
}

// Keys that open the full site while it's gated: the team's own, plus one
// per outside tester (comma-separated in LAUNCH_GATE_TESTER_KEYS), so a
// tester's access ends as soon as their key is taken out of the list.
function previewKeys() {
  const testerKeys = (process.env.LAUNCH_GATE_TESTER_KEYS ?? "")
    .split(",")
    .map((key) => key.trim())
    .filter((key) => key.length >= 16);
  const teamKey = process.env.LAUNCH_GATE_BYPASS_SECRET;

  return teamKey ? [teamKey, ...testerKeys] : testerKeys;
}

export default auth((req) => {
  const { pathname, searchParams } = req.nextUrl;

  if (launchGateIsOn() && pathname !== "/coming-soon") {
    const keys = previewKeys();
    const previewParam = searchParams.get("preview");
    const cookieKey = req.cookies.get(PREVIEW_COOKIE)?.value;
    const hasValidCookie = !!cookieKey && keys.includes(cookieKey);

    if (previewParam && keys.includes(previewParam)) {
      const cleanUrl = new URL(req.nextUrl);
      cleanUrl.searchParams.delete("preview");
      const res = NextResponse.redirect(cleanUrl);
      res.cookies.set(PREVIEW_COOKIE, previewParam, {
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

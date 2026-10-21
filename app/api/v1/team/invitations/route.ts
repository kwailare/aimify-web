import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-context";
import { getOrgContextForUser } from "@/lib/org";
import { inviteMember } from "@/lib/team-invites";

const STATUS_FOR_CODE: Record<string, number> = {
  invalid_email: 400,
  role_not_assignable: 403,
  plan_limit: 403,
  too_many_pending: 409,
  already_in_organization: 409,
  rate_limited: 429,
};

export async function POST(request: Request) {
  const context = await guardApi(request, "team.manage");

  if (context instanceof NextResponse) return context;

  const orgContext = await getOrgContextForUser(context.userId);

  if (!orgContext?.membership) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!orgContext.user.emailVerifiedAt) {
    return NextResponse.json(
      {
        error: "Confirm your email address before inviting people.",
        code: "email_unverified",
      },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email : "";
  const role = typeof body?.role === "string" ? body.role : "";

  if (!email || !role) {
    return NextResponse.json(
      { error: "email and role are required.", code: "invalid_request" },
      { status: 400 },
    );
  }

  const result = await inviteMember({
    organization: orgContext.membership.organization,
    inviter: {
      id: orgContext.user.id,
      name: orgContext.user.name,
      role: orgContext.membership.role,
    },
    email,
    role,
  });

  if (!result.success) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: STATUS_FOR_CODE[result.code] ?? 400 },
    );
  }

  return NextResponse.json(
    {
      invitation: { id: result.id, email: result.email, role: result.role },
      emailSent: result.emailSent,
    },
    { status: 201 },
  );
}

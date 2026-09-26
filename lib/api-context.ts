import { NextResponse } from "next/server";
import { verifyApiToken } from "@/lib/api-auth";
import { getOrgContextForUser } from "@/lib/org";
import { can, type Permission } from "@/lib/permissions";
import { blockedMessage, hasProductAccess } from "@/lib/subscription";

export type ApiOrgContext = {
  userId: string;
  organizationId: string;
  role: string;
  subscriptionStatus: string;
};

export async function getApiOrgContext(
  request: Request,
): Promise<ApiOrgContext | null> {
  const userId = await verifyApiToken(request);

  if (!userId) {
    return null;
  }

  const context = await getOrgContextForUser(userId);

  if (!context?.membership) {
    return null;
  }

  return {
    userId,
    organizationId: context.membership.organization.id,
    role: context.membership.role,
    subscriptionStatus: context.membership.organization.subscriptionStatus,
  };
}

export function denyIfForbidden(
  context: ApiOrgContext,
  permission: Permission,
): NextResponse | null {
  if (can(context.role, permission)) {
    return null;
  }

  return NextResponse.json(
    {
      error: `Your role (${context.role}) isn't allowed to do this.`,
      code: "forbidden_role",
      role: context.role,
      permission,
    },
    { status: 403 },
  );
}

export async function guardApi(
  request: Request,
  permission?: Permission,
): Promise<ApiOrgContext | NextResponse> {
  const context = await getApiOrgContext(request);

  if (!context) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!hasProductAccess(context.subscriptionStatus)) {
    return NextResponse.json(
      {
        error: blockedMessage(context.subscriptionStatus),
        code: "subscription_inactive",
        subscriptionStatus: context.subscriptionStatus,
      },
      { status: context.subscriptionStatus === "suspended" ? 403 : 402 },
    );
  }

  if (permission) {
    const denied = denyIfForbidden(context, permission);

    if (denied) return denied;
  }

  return context;
}

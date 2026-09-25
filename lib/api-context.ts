import { NextResponse } from "next/server";
import { verifyApiToken } from "@/lib/api-auth";
import { getOrgContextForUser } from "@/lib/org";
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

export async function guardApi(
  request: Request,
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

  return context;
}

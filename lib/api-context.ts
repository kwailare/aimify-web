import { NextResponse } from "next/server";
import { verifyApiToken } from "@/lib/api-auth";
import { getOrgContextForUser } from "@/lib/org";
import type { Permission } from "@/lib/permissions";
import { getPermissionsFor } from "@/lib/role-permissions";
import { blockedMessage, hasProductAccess } from "@/lib/subscription";

export type ApiOrgContext = {
  userId: string;
  organizationId: string;
  role: string;
  subscriptionStatus: string;
  permissions: ReadonlySet<Permission>;
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

  const organizationId = context.membership.organization.id;
  const role = context.membership.role;

  return {
    userId,
    organizationId,
    role,
    subscriptionStatus: context.membership.organization.subscriptionStatus,
    permissions: await getPermissionsFor(organizationId, role),
  };
}

export function denyIfForbidden(
  context: ApiOrgContext,
  permission: Permission,
): NextResponse | null {
  if (context.permissions.has(permission)) {
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

// An update can change a record's fields, its status (archive, disable,
// restore) or both, and each needs its own permission.
export function denyIfChangeForbidden(
  context: ApiOrgContext,
  changes: object,
  permissions: { status: Permission; fields: Permission },
): NextResponse | null {
  const keys = Object.keys(changes);

  if (keys.includes("status")) {
    const denied = denyIfForbidden(context, permissions.status);
    if (denied) return denied;
  }

  if (keys.some((key) => key !== "status")) {
    return denyIfForbidden(context, permissions.fields);
  }

  return null;
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

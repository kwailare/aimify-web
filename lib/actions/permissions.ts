"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { rolePermissions } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { getOrgContext } from "@/lib/org";
import {
  EDITABLE_ROLES,
  defaultPermissions,
  normalizePermissions,
} from "@/lib/permissions";
import { getCustomPermissions } from "@/lib/role-permissions";

async function getOwner() {
  const context = await getOrgContext();

  if (!context?.membership || !context.user.emailVerifiedAt) return null;

  const { organization, role } = context.membership;

  if (role !== "Owner" || organization.subscriptionStatus === "suspended") return null;

  return { userId: context.user.id, organizationId: organization.id };
}

function isEditableRole(role: string) {
  return (EDITABLE_ROLES as readonly string[]).includes(role);
}

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((key) => b.includes(key));

export async function saveRolePermissionsAction(role: string, keys: string[]) {
  const owner = await getOwner();

  if (!owner) {
    return { error: "Only the Owner can change role permissions." };
  }

  if (!isEditableRole(role)) {
    return { error: "That role's permissions can't be changed." };
  }

  const permissions = normalizePermissions(Array.isArray(keys) ? keys : []);
  const custom = await getCustomPermissions(owner.organizationId, role);
  const before = custom ? normalizePermissions(custom) : defaultPermissions(role);

  if (sameSet(before, permissions)) {
    return { success: true };
  }

  if (sameSet(permissions, defaultPermissions(role))) {
    await db
      .delete(rolePermissions)
      .where(
        and(
          eq(rolePermissions.organizationId, owner.organizationId),
          eq(rolePermissions.role, role),
        ),
      );
  } else {
    await db
      .insert(rolePermissions)
      .values({
        organizationId: owner.organizationId,
        role,
        permissions,
        updatedBy: owner.userId,
      })
      .onConflictDoUpdate({
        target: [rolePermissions.organizationId, rolePermissions.role],
        set: { permissions, updatedBy: owner.userId, updatedAt: new Date() },
      });
  }

  await logAudit({
    organizationId: owner.organizationId,
    userId: owner.userId,
    module: "team",
    action: "team.permissions_updated",
    previousValue: { role, permissions: before },
    newValue: { role, permissions },
  });

  revalidatePath("/dashboard/team/permissions");

  return { success: true };
}

export async function resetRolePermissionsAction(role: string) {
  const owner = await getOwner();

  if (!owner) {
    return { error: "Only the Owner can change role permissions." };
  }

  if (!isEditableRole(role)) {
    return { error: "That role's permissions can't be changed." };
  }

  const custom = await getCustomPermissions(owner.organizationId, role);

  if (!custom) {
    return { success: true };
  }

  await db
    .delete(rolePermissions)
    .where(
      and(
        eq(rolePermissions.organizationId, owner.organizationId),
        eq(rolePermissions.role, role),
      ),
    );

  await logAudit({
    organizationId: owner.organizationId,
    userId: owner.userId,
    module: "team",
    action: "team.permissions_reset",
    previousValue: { role, permissions: normalizePermissions(custom) },
    newValue: { role, permissions: defaultPermissions(role) },
  });

  revalidatePath("/dashboard/team/permissions");

  return { success: true };
}

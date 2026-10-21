import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { rolePermissions } from "@/db/schema";
import {
  EDITABLE_ROLES,
  defaultPermissions,
  isEditablePermission,
  resolvePermissions,
  type EditablePermission,
  type Permission,
} from "@/lib/permissions";

export async function getCustomPermissions(organizationId: string, role: string) {
  const [row] = await db
    .select({ permissions: rolePermissions.permissions })
    .from(rolePermissions)
    .where(
      and(eq(rolePermissions.organizationId, organizationId), eq(rolePermissions.role, role)),
    )
    .limit(1);

  return row?.permissions ?? null;
}

export async function getPermissionsFor(
  organizationId: string | null | undefined,
  role: string | null | undefined,
): Promise<Set<Permission>> {
  if (!organizationId || !role) return new Set();

  const custom = role === "Owner" ? null : await getCustomPermissions(organizationId, role);

  return resolvePermissions(role, custom);
}

export type RolePermissionRow = {
  role: string;
  permissions: EditablePermission[];
  customized: boolean;
  defaults: EditablePermission[];
};

export async function getPermissionMatrix(organizationId: string): Promise<RolePermissionRow[]> {
  const rows = await db
    .select({ role: rolePermissions.role, permissions: rolePermissions.permissions })
    .from(rolePermissions)
    .where(eq(rolePermissions.organizationId, organizationId));

  const custom = new Map(rows.map((row) => [row.role, row.permissions]));

  return EDITABLE_ROLES.map((role) => {
    const saved = custom.get(role) ?? null;
    const resolved = resolvePermissions(role, saved);
    return {
      role,
      permissions: [...resolved].filter(isEditablePermission),
      customized: saved !== null,
      defaults: defaultPermissions(role),
    };
  });
}

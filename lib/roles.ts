export const ROLES = [
  "Owner",
  "Administrator",
  "Warehouse Manager",
  "Sales Staff",
  "Inventory Staff",
  "Accountant / Finance",
] as const;

export type Role = (typeof ROLES)[number];

const TEAM_MANAGERS = new Set<string>(["Owner", "Administrator"]);
const PROTECTED_FROM_ADMINS = new Set<string>(["Owner", "Administrator"]);

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function canManageTeam(role: string) {
  return TEAM_MANAGERS.has(role);
}

export function assignableRoles(actorRole: string): Role[] {
  if (actorRole === "Owner") return [...ROLES];
  if (actorRole === "Administrator") {
    return ROLES.filter((role) => !PROTECTED_FROM_ADMINS.has(role));
  }
  return [];
}

export function canChangeMember(actorRole: string, memberRole: string) {
  if (actorRole === "Owner") return true;
  if (actorRole === "Administrator") return !PROTECTED_FROM_ADMINS.has(memberRole);
  return false;
}

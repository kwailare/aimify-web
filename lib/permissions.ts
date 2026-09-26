export const PERMISSIONS = [
  "products.write",
  "products.archive",
  "catalog.write",
  "warehouses.manage",
  "stock.out",
  "stock.adjust",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const MANAGERS = ["Owner", "Administrator", "Warehouse Manager"];
const STOCK_STAFF = [...MANAGERS, "Inventory Staff"];

const GRANTS: Record<Permission, readonly string[]> = {
  "products.write": STOCK_STAFF,
  "products.archive": MANAGERS,
  "catalog.write": STOCK_STAFF,
  "warehouses.manage": MANAGERS,
  "stock.out": [...STOCK_STAFF, "Sales Staff"],
  "stock.adjust": STOCK_STAFF,
};

export function can(role: string | null | undefined, permission: Permission) {
  return Boolean(role) && GRANTS[permission].includes(role as string);
}

export function permissionsFor(role: string | null | undefined) {
  return PERMISSIONS.filter((permission) => can(role, permission));
}

export function movementPermission(type: string): Permission {
  return type === "stock_out" ? "stock.out" : "stock.adjust";
}

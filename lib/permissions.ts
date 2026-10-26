import { ROLES } from "@/lib/roles";

export const PERMISSION_MODULES = [
  {
    module: "products",
    label: "Products",
    actions: [
      { key: "products.view", label: "View" },
      { key: "products.create", label: "Add" },
      { key: "products.edit", label: "Edit" },
      { key: "products.archive", label: "Archive" },
    ],
  },
  {
    module: "catalog",
    label: "Categories & units",
    actions: [
      { key: "catalog.view", label: "View" },
      { key: "catalog.create", label: "Add" },
      { key: "catalog.delete", label: "Delete" },
    ],
  },
  {
    module: "stock",
    label: "Stock movements",
    actions: [
      { key: "stock.view", label: "View" },
      { key: "stock.in", label: "Stock in" },
      { key: "stock.out", label: "Stock out" },
      { key: "stock.adjust", label: "Adjust & count" },
    ],
  },
  {
    module: "warehouses",
    label: "Warehouses",
    actions: [
      { key: "warehouses.view", label: "View" },
      { key: "warehouses.create", label: "Add" },
      { key: "warehouses.edit", label: "Edit" },
      { key: "warehouses.disable", label: "Disable" },
    ],
  },
  {
    module: "customers",
    label: "Customers",
    actions: [
      { key: "customers.view", label: "View" },
      { key: "customers.create", label: "Add" },
      { key: "customers.edit", label: "Edit" },
      { key: "customers.archive", label: "Archive" },
      { key: "customers.types", label: "Manage types" },
    ],
  },
  {
    module: "suppliers",
    label: "Suppliers",
    actions: [
      { key: "suppliers.view", label: "View" },
      { key: "suppliers.create", label: "Add" },
      { key: "suppliers.edit", label: "Edit" },
      { key: "suppliers.archive", label: "Archive" },
    ],
  },
  {
    module: "credit",
    label: "Credit ledger",
    actions: [{ key: "credit.record", label: "Record entries" }],
  },
  {
    module: "purchases",
    label: "Purchases",
    actions: [
      { key: "purchases.view", label: "View" },
      { key: "purchases.create", label: "Add & edit" },
      { key: "purchases.receive", label: "Receive" },
      { key: "purchases.cancel", label: "Cancel" },
    ],
  },
  {
    module: "sales",
    label: "Sales",
    actions: [
      { key: "sales.view", label: "View" },
      { key: "sales.create", label: "Sell" },
      { key: "sales.discount", label: "Discounts & prices" },
      { key: "sales.override", label: "Override credit limit" },
      { key: "sales.void", label: "Void" },
    ],
  },
] as const;

type ModuleAction = (typeof PERMISSION_MODULES)[number]["actions"][number];

export type EditablePermission = ModuleAction["key"];

export const EDITABLE_PERMISSIONS: readonly EditablePermission[] = PERMISSION_MODULES.flatMap(
  (group) => group.actions.map((action) => action.key),
);

// Account administration stays with Owners and Administrators and can't be
// handed to other roles.
export const FIXED_PERMISSIONS = ["team.manage", "setup.complete"] as const;

export type FixedPermission = (typeof FIXED_PERMISSIONS)[number];
export type Permission = EditablePermission | FixedPermission;

export const PERMISSIONS: readonly Permission[] = [...EDITABLE_PERMISSIONS, ...FIXED_PERMISSIONS];

export const EDITABLE_ROLES = ROLES.filter((role) => role !== "Owner");

const EVERYONE = [...ROLES];
const MANAGERS = ["Owner", "Administrator", "Warehouse Manager"];
const STOCK_STAFF = [...MANAGERS, "Inventory Staff"];
const SELLERS = ["Owner", "Administrator", "Sales Staff"];
const FINANCE = ["Owner", "Administrator", "Accountant / Finance"];
const ADMINS = ["Owner", "Administrator"];

const DEFAULT_GRANTS: Record<EditablePermission, readonly string[]> = {
  "products.view": EVERYONE,
  "products.create": STOCK_STAFF,
  "products.edit": STOCK_STAFF,
  "products.archive": MANAGERS,
  "catalog.view": EVERYONE,
  "catalog.create": STOCK_STAFF,
  "catalog.delete": STOCK_STAFF,
  "stock.view": EVERYONE,
  "stock.in": STOCK_STAFF,
  "stock.out": [...STOCK_STAFF, "Sales Staff"],
  "stock.adjust": STOCK_STAFF,
  "warehouses.view": EVERYONE,
  "warehouses.create": MANAGERS,
  "warehouses.edit": MANAGERS,
  "warehouses.disable": MANAGERS,
  "customers.view": [...SELLERS, "Accountant / Finance"],
  "customers.create": SELLERS,
  "customers.edit": SELLERS,
  "customers.archive": SELLERS,
  "customers.types": ADMINS,
  "suppliers.view": [...MANAGERS, "Accountant / Finance"],
  "suppliers.create": MANAGERS,
  "suppliers.edit": MANAGERS,
  "suppliers.archive": MANAGERS,
  "credit.record": FINANCE,
  "purchases.view": [...MANAGERS, "Accountant / Finance"],
  "purchases.create": MANAGERS,
  "purchases.receive": MANAGERS,
  "purchases.cancel": MANAGERS,
  "sales.view": [...SELLERS, "Accountant / Finance"],
  "sales.create": SELLERS,
  "sales.discount": ADMINS,
  "sales.override": ADMINS,
  "sales.void": ADMINS,
};

const FIXED_GRANTS: Record<FixedPermission, readonly string[]> = {
  "team.manage": ADMINS,
  "setup.complete": ADMINS,
};

export function isEditablePermission(value: string): value is EditablePermission {
  return (EDITABLE_PERMISSIONS as readonly string[]).includes(value);
}

export function defaultPermissions(role: string): EditablePermission[] {
  return EDITABLE_PERMISSIONS.filter((key) => DEFAULT_GRANTS[key].includes(role));
}

// What each action can't work without: every action needs its own module's
// view, recording stock means picking a product and a warehouse, the
// product form picks a category and unit, and a purchase picks products
// and a warehouse.
const EXTRA_REQUIREMENTS: Partial<Record<EditablePermission, EditablePermission[]>> = {
  "products.create": ["catalog.view"],
  "products.edit": ["catalog.view"],
  "stock.in": ["products.view", "warehouses.view"],
  "stock.out": ["products.view", "warehouses.view"],
  "stock.adjust": ["products.view", "warehouses.view"],
  "purchases.create": ["products.view", "warehouses.view"],
  "purchases.receive": ["products.view", "warehouses.view"],
  "sales.create": ["products.view", "warehouses.view"],
  "sales.discount": ["sales.create"],
  "sales.override": ["sales.create"],
};

export function requiredBy(key: EditablePermission): EditablePermission[] {
  const [module] = key.split(".");
  const view = `${module}.view`;
  const own = isEditablePermission(view) && view !== key ? [view] : [];
  return [...own, ...(EXTRA_REQUIREMENTS[key] ?? [])];
}

export function normalizePermissions(keys: Iterable<string>): EditablePermission[] {
  const chosen = new Set<EditablePermission>([...keys].filter(isEditablePermission));

  for (const key of [...chosen]) {
    for (const needed of requiredBy(key)) chosen.add(needed);
  }

  return EDITABLE_PERMISSIONS.filter((key) => chosen.has(key));
}

// Removing a permission also removes every action that can't work without it.
export function withoutPermission(keys: Iterable<string>, removed: EditablePermission) {
  const remaining = new Set([...keys].filter(isEditablePermission));
  remaining.delete(removed);

  for (const key of [...remaining]) {
    if (requiredBy(key).includes(removed)) remaining.delete(key);
  }

  return EDITABLE_PERMISSIONS.filter((key) => remaining.has(key));
}

export function resolvePermissions(
  role: string | null | undefined,
  custom: readonly string[] | null,
): Set<Permission> {
  if (!role) return new Set();

  const editable =
    role === "Owner"
      ? EDITABLE_PERMISSIONS
      : custom
        ? normalizePermissions(custom)
        : defaultPermissions(role);

  const fixed = FIXED_PERMISSIONS.filter((key) => FIXED_GRANTS[key].includes(role));

  return new Set<Permission>([...editable, ...fixed]);
}

// Keys from before per-module permissions, still sent on /me so desktop app
// builds released earlier keep showing the right controls.
export function legacyPermissions(granted: ReadonlySet<string>): string[] {
  const any = (...keys: string[]) => keys.some((key) => granted.has(key));
  const legacy: [string, boolean][] = [
    ["products.write", any("products.create", "products.edit")],
    ["catalog.write", any("catalog.create", "catalog.delete")],
    ["warehouses.manage", any("warehouses.create", "warehouses.edit", "warehouses.disable")],
    ["customers.read", any("customers.view")],
    ["customers.write", any("customers.create", "customers.edit", "customers.archive")],
    ["suppliers.read", any("suppliers.view")],
    ["suppliers.write", any("suppliers.create", "suppliers.edit", "suppliers.archive")],
  ];
  return legacy.filter(([, has]) => has).map(([key]) => key);
}

export function movementPermission(type: string): Permission {
  if (type === "stock_in") return "stock.in";
  if (type === "stock_out") return "stock.out";
  return "stock.adjust";
}

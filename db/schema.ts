import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  integer,
  numeric,
  unique,
  boolean,
  index,
} from "drizzle-orm/pg-core";

export const organizations = pgTable("organizations", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  industry: text(),
  currency: text().notNull().default("NGN"),
  warehouseName: text(),
  subscriptionStatus: text().notNull().default("pending"),
  trialEndsAt: timestamp(),
  createdAt: timestamp().defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  email: text().notNull().unique(),
  passwordHash: text().notNull(),
  name: text().notNull(),
  phone: text(),
  createdAt: timestamp().defaultNow().notNull(),
});

export const memberships = pgTable("memberships", {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid()
    .notNull()
    .references(() => users.id),
  organizationId: uuid()
    .notNull()
    .references(() => organizations.id),
  role: text().notNull(),
  createdAt: timestamp().defaultNow().notNull(),
});

export const adminUsers = pgTable("admin_users", {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid()
    .notNull()
    .unique()
    .references(() => users.id),
  createdAt: timestamp().defaultNow().notNull(),
});

export const auditLogs = pgTable("audit_logs", {
  id: uuid().primaryKey().defaultRandom(),
  organizationId: uuid().references(() => organizations.id),
  userId: uuid().references(() => users.id),
  module: text().notNull(),
  action: text().notNull(),
  recordId: text(),
  previousValue: jsonb(),
  newValue: jsonb(),
  createdAt: timestamp().defaultNow().notNull(),
});

export const warehouses = pgTable("warehouses", {
  id: uuid().primaryKey().defaultRandom(),
  organizationId: uuid()
    .notNull()
    .references(() => organizations.id),
  name: text().notNull(),
  address: text(),
  managerName: text(),
  phone: text(),
  status: text().notNull().default("active"),
  createdAt: timestamp().defaultNow().notNull(),
});

export const products = pgTable(
  "products",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    sku: text().notNull(),
    barcode: text(),
    name: text().notNull(),
    description: text(),
    category: text(),
    unit: text().notNull().default("piece"),
    purchasePrice: numeric({ mode: "number" }).notNull().default(0),
    sellingPrice: numeric({ mode: "number" }).notNull().default(0),
    minStock: integer().notNull().default(0),
    currentStock: integer().notNull().default(0),
    status: text().notNull().default("active"),
    createdAt: timestamp().defaultNow().notNull(),
    updatedAt: timestamp().defaultNow().notNull(),
  },
  (table) => [unique().on(table.organizationId, table.sku)],
);

export const stockMovements = pgTable("stock_movements", {
  id: uuid().primaryKey().defaultRandom(),
  organizationId: uuid()
    .notNull()
    .references(() => organizations.id),
  warehouseId: uuid()
    .notNull()
    .references(() => warehouses.id),
  productId: uuid()
    .notNull()
    .references(() => products.id),
  userId: uuid().references(() => users.id),
  type: text().notNull(),
  quantity: integer().notNull(),
  reason: text(),
  previousStock: integer().notNull(),
  newStock: integer().notNull(),
  createdAt: timestamp().defaultNow().notNull(),
});

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: uuid().primaryKey().defaultRandom(),
    identifier: text().notNull(),
    success: boolean().notNull(),
    createdAt: timestamp().defaultNow().notNull(),
  },
  (table) => [index("login_attempts_identifier_created_at_idx").on(
    table.identifier,
    table.createdAt,
  )],
);

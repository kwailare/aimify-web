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

export const plans = pgTable("plans", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  description: text(),
  priceMonthly: numeric({ mode: "number" }).notNull().default(0),
  maxUsers: integer(),
  maxWarehouses: integer(),
  maxProducts: integer(),
  isDefault: boolean().notNull().default(false),
  isActive: boolean().notNull().default(true),
  createdAt: timestamp().defaultNow().notNull(),
});

export const organizations = pgTable("organizations", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  industry: text(),
  currency: text().notNull().default("NGN"),
  warehouseName: text(),
  logoUrl: text(),
  registrationNumber: text(),
  address: text(),
  phone: text(),
  email: text(),
  taxName: text(),
  taxRate: numeric({ mode: "number" }).notNull().default(0),
  timezone: text().notNull().default("Africa/Lagos"),
  dateFormat: text().notNull().default("DD/MM/YYYY"),
  subscriptionStatus: text().notNull().default("pending"),
  trialEndsAt: timestamp(),
  planId: uuid().references(() => plans.id),
  createdAt: timestamp().defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  email: text().notNull().unique(),
  passwordHash: text().notNull(),
  name: text().notNull(),
  phone: text(),
  emailVerifiedAt: timestamp(),
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
    brand: text(),
    imageUrl: text(),
    category: text(),
    unit: text().notNull().default("piece"),
    purchasePrice: numeric({ mode: "number" }).notNull().default(0),
    sellingPrice: numeric({ mode: "number" }).notNull().default(0),
    minStock: integer().notNull().default(0),
    maxStock: integer(),
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

export const catalogOptions = pgTable(
  "catalog_options",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    kind: text().notNull(),
    name: text().notNull(),
    createdAt: timestamp().defaultNow().notNull(),
  },
  (table) => [unique().on(table.organizationId, table.kind, table.name)],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    amount: numeric({ mode: "number" }).notNull(),
    currency: text().notNull().default("NGN"),
    status: text().notNull().default("pending"),
    provider: text(),
    providerReference: text().unique(),
    description: text(),
    paidAt: timestamp(),
    createdAt: timestamp().defaultNow().notNull(),
  },
  (table) => [
    index("payments_organization_created_at_idx").on(
      table.organizationId,
      table.createdAt,
    ),
  ],
);

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid()
    .notNull()
    .references(() => users.id),
  tokenHash: text().notNull().unique(),
  expiresAt: timestamp().notNull(),
  usedAt: timestamp(),
  createdAt: timestamp().defaultNow().notNull(),
});

export const emailVerificationTokens = pgTable("email_verification_tokens", {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid()
    .notNull()
    .references(() => users.id),
  tokenHash: text().notNull().unique(),
  expiresAt: timestamp().notNull(),
  usedAt: timestamp(),
  createdAt: timestamp().defaultNow().notNull(),
});

export const invitations = pgTable(
  "invitations",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    email: text().notNull(),
    role: text().notNull(),
    tokenHash: text().notNull().unique(),
    invitedBy: uuid().references(() => users.id),
    expiresAt: timestamp().notNull(),
    acceptedAt: timestamp(),
    revokedAt: timestamp(),
    createdAt: timestamp().defaultNow().notNull(),
  },
  (table) => [
    index("invitations_organization_created_at_idx").on(
      table.organizationId,
      table.createdAt,
    ),
    index("invitations_email_idx").on(table.email),
  ],
);

export const subscriptionNotices = pgTable(
  "subscription_notices",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    kind: text().notNull(),
    period: text().notNull(),
    sentAt: timestamp().defaultNow().notNull(),
  },
  (table) => [unique().on(table.organizationId, table.kind, table.period)],
);

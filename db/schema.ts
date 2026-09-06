import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

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

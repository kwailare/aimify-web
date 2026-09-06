import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const organizations = pgTable("organizations", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  currency: text().notNull().default("NGN"),
  createdAt: timestamp().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  email: text().notNull().unique(),
  passwordHash: text().notNull(),
});

export const memberships = pgTable("memberships", {
  userId: uuid().references(() => users.id),
  organizationId: uuid().references(() => organizations.id),
  role: text().notNull(),
});

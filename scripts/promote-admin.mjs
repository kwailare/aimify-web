import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { eq } from "drizzle-orm";
import { config } from "dotenv";

config({ path: ".env.local" });

const users = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  email: text().notNull().unique(),
  name: text().notNull(),
});

const adminUsers = pgTable("admin_users", {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid().notNull().unique(),
  createdAt: timestamp().defaultNow().notNull(),
});

const email = process.argv[2];

if (!email) {
  console.error("Usage: node scripts/promote-admin.mjs <email>");
  console.error("The user must already have an account (sign up at /signup first).");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Add it to .env.local.");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql);

const [user] = await db
  .select()
  .from(users)
  .where(eq(users.email, email.toLowerCase().trim()))
  .limit(1);

if (!user) {
  console.error(`No account found for ${email}. They need to sign up at /signup first.`);
  process.exit(1);
}

const [existing] = await db
  .select()
  .from(adminUsers)
  .where(eq(adminUsers.userId, user.id))
  .limit(1);

if (existing) {
  console.log(`${email} is already an admin.`);
  process.exit(0);
}

await db.insert(adminUsers).values({ userId: user.id });

console.log(`${email} (${user.name}) is now a super admin.`);

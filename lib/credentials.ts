import { compare } from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

export async function verifyCredentials(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (!user) {
    return null;
  }

  const isValid = await compare(password, user.passwordHash);

  return isValid ? user : null;
}

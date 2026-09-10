"use server";

import { eq } from "drizzle-orm";
import { hash } from "bcryptjs";
import { AuthError } from "next-auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { signIn } from "@/auth";
import { logAudit } from "@/lib/audit";

export async function signUpAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!name || !email || !password) {
    return { error: "All fields are required." };
  }

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) {
    return { error: "An account with this email already exists." };
  }

  const passwordHash = await hash(password, 10);

  const [newUser] = await db
    .insert(users)
    .values({ name, email, passwordHash })
    .returning();

  await logAudit({
    userId: newUser.id,
    module: "auth",
    action: "user.signed_up",
    recordId: newUser.id,
    newValue: { name, email },
  });

  try {
    await signIn("credentials", { email, password, redirect: false });
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        error: "Account created, but sign-in failed. Try signing in manually.",
      };
    }
    throw error;
  }

  return { success: true };
}

export async function signInAction(formData: FormData) {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  try {
    await signIn("credentials", { email, password, redirect: false });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Invalid email or password." };
    }
    throw error;
  }

  const [signedInUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (signedInUser) {
    await logAudit({
      userId: signedInUser.id,
      module: "auth",
      action: "user.signed_in",
      recordId: signedInUser.id,
    });
  }

  return { success: true };
}

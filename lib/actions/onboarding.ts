"use server";

import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { memberships, organizations, users } from "@/db/schema";

export async function completeProfileAction(formData: FormData) {
  const session = await auth();

  if (!session?.user?.id) {
    return { error: "You need to sign in first." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  if (!name || !phone) {
    return { error: "Full name and phone number are required." };
  }

  await db.update(users).set({ name, phone }).where(eq(users.id, session.user.id));

  return { success: true };
}

export async function completeOrganizationAction(formData: FormData) {
  const session = await auth();

  if (!session?.user?.id) {
    return { error: "You need to sign in first." };
  }

  const name = String(formData.get("companyName") ?? "").trim();
  const industry = String(formData.get("industry") ?? "").trim();
  const currency = String(formData.get("currency") ?? "").trim() || "NGN";
  const warehouseName = String(formData.get("warehouse") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim();

  if (!name || !role) {
    return { error: "Company name and your role are required." };
  }

  const [org] = await db
    .insert(organizations)
    .values({ name, industry, currency, warehouseName })
    .returning();

  await db.insert(memberships).values({
    userId: session.user.id,
    organizationId: org.id,
    role,
  });

  return { success: true };
}

export async function completeSubscriptionAction() {
  const session = await auth();

  if (!session?.user?.id) {
    return { error: "You need to sign in first." };
  }

  const [membership] = await db
    .select({ organizationId: memberships.organizationId })
    .from(memberships)
    .where(eq(memberships.userId, session.user.id))
    .limit(1);

  if (!membership) {
    return { error: "Create your organization first." };
  }

  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 14);

  await db
    .update(organizations)
    .set({ subscriptionStatus: "trial", trialEndsAt })
    .where(eq(organizations.id, membership.organizationId));

  return { success: true };
}

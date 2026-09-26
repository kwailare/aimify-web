"use server";

import { and, asc, eq } from "drizzle-orm";
import { after } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { memberships, organizations, warehouses } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { deleteOwnedBlob, isBlobConfigured, uploadImage } from "@/lib/blob";
import { readImageFile } from "@/lib/images";
import {
  CURRENCIES,
  DATE_FORMATS,
  INDUSTRIES,
  TIMEZONES,
} from "@/lib/org-options";
import { canManageTeam } from "@/lib/roles";
import { canCancelSubscription } from "@/lib/subscription";
import { notifySubscriptionChange } from "@/lib/subscription-notices";
import { syncPrimaryWarehouseName } from "@/lib/warehouses";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function getSessionMembership() {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const [membership] = await db
    .select({
      organizationId: memberships.organizationId,
      role: memberships.role,
    })
    .from(memberships)
    .where(eq(memberships.userId, session.user.id))
    .limit(1);

  return membership
    ? {
        userId: session.user.id,
        organizationId: membership.organizationId,
        role: membership.role,
      }
    : null;
}

function optionalText(formData: FormData, key: string, max = 200) {
  const value = String(formData.get(key) ?? "").trim();
  return value ? value.slice(0, max) : null;
}

export async function updateOrganizationAction(formData: FormData) {
  const membership = await getSessionMembership();

  if (!membership) {
    return { error: "You need to sign in and create an organization first." };
  }

  if (!canManageTeam(membership.role)) {
    return { error: "Only an Owner or Administrator can do this." };
  }

  const name = String(formData.get("companyName") ?? "").trim();
  const industry = String(formData.get("industry") ?? "").trim();
  const currency = String(formData.get("currency") ?? "").trim();
  const warehouseName = String(formData.get("warehouseName") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim();
  const dateFormat = String(formData.get("dateFormat") ?? "").trim();
  const taxRate = Number(String(formData.get("taxRate") ?? "0").trim() || "0");
  const email = optionalText(formData, "email");

  if (!name) {
    return { error: "Company name is required." };
  }

  if (name.length > 120) {
    return { error: "Company name is too long." };
  }

  if (!INDUSTRIES.includes(industry)) {
    return { error: "Choose an industry from the list." };
  }

  if (!CURRENCIES.some((option) => option.code === currency)) {
    return { error: "Choose a currency from the list." };
  }

  if (!TIMEZONES.includes(timezone)) {
    return { error: "Choose a time zone from the list." };
  }

  if (!DATE_FORMATS.includes(dateFormat)) {
    return { error: "Choose a date format from the list." };
  }

  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
    return { error: "Tax rate must be a number between 0 and 100." };
  }

  if (email && !EMAIL_PATTERN.test(email)) {
    return { error: "Enter a valid company email address." };
  }

  const [before] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, membership.organizationId))
    .limit(1);

  if (!before) {
    return { error: "Organization not found." };
  }

  const changes = {
    name,
    industry,
    currency,
    timezone,
    dateFormat,
    taxRate,
    taxName: optionalText(formData, "taxName", 40),
    registrationNumber: optionalText(formData, "registrationNumber", 60),
    address: optionalText(formData, "address", 300),
    phone: optionalText(formData, "phone", 30),
    email,
  };

  await db
    .update(organizations)
    .set(changes)
    .where(eq(organizations.id, membership.organizationId));

  if (warehouseName && warehouseName !== before.warehouseName) {
    const [primary] = await db
      .select({ id: warehouses.id })
      .from(warehouses)
      .where(eq(warehouses.organizationId, membership.organizationId))
      .orderBy(asc(warehouses.createdAt))
      .limit(1);

    if (primary) {
      await db
        .update(warehouses)
        .set({ name: warehouseName })
        .where(
          and(
            eq(warehouses.id, primary.id),
            eq(warehouses.organizationId, membership.organizationId),
          ),
        );
    } else {
      await db.insert(warehouses).values({
        organizationId: membership.organizationId,
        name: warehouseName,
      });
    }

    await syncPrimaryWarehouseName(membership.organizationId);
  }

  const previousValue: Record<string, unknown> = {};
  const newValue: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(changes)) {
    const previous = before[key as keyof typeof before];
    if (previous !== value) {
      previousValue[key] = previous;
      newValue[key] = value;
    }
  }

  if (warehouseName && warehouseName !== before.warehouseName) {
    previousValue.warehouseName = before.warehouseName;
    newValue.warehouseName = warehouseName;
  }

  await logAudit({
    organizationId: membership.organizationId,
    userId: membership.userId,
    module: "organization",
    action: "organization.updated",
    recordId: membership.organizationId,
    previousValue,
    newValue,
  });

  return { success: true };
}

export async function cancelSubscriptionAction() {
  const membership = await getSessionMembership();

  if (!membership) {
    return { error: "You need to sign in and create an organization first." };
  }

  if (membership.role !== "Owner") {
    return { error: "Only an Owner can cancel the subscription." };
  }

  const [before] = await db
    .select({ subscriptionStatus: organizations.subscriptionStatus })
    .from(organizations)
    .where(eq(organizations.id, membership.organizationId))
    .limit(1);

  if (!before || !canCancelSubscription(before.subscriptionStatus)) {
    return { error: "This subscription can't be cancelled." };
  }

  const [updated] = await db
    .update(organizations)
    .set({ subscriptionStatus: "cancelled" })
    .where(
      and(
        eq(organizations.id, membership.organizationId),
        eq(organizations.subscriptionStatus, before.subscriptionStatus),
      ),
    )
    .returning({ id: organizations.id });

  if (!updated) {
    return { error: "The subscription changed while you were cancelling. Refresh and try again." };
  }

  await logAudit({
    organizationId: membership.organizationId,
    userId: membership.userId,
    module: "subscription",
    action: "subscription.cancelled",
    recordId: membership.organizationId,
    previousValue: before,
    newValue: { subscriptionStatus: "cancelled" },
  });

  after(() => notifySubscriptionChange(membership.organizationId, "cancelled"));

  return { success: true };
}

export async function uploadLogoAction(formData: FormData) {
  const membership = await getSessionMembership();

  if (!membership) {
    return { error: "You need to sign in and create an organization first." };
  }

  if (!canManageTeam(membership.role)) {
    return { error: "Only an Owner or Administrator can do this." };
  }

  if (!isBlobConfigured()) {
    return { error: "Logo uploads aren't available right now." };
  }

  const image = await readImageFile(formData.get("logo"));

  if (!image.ok) {
    return { error: image.error };
  }

  const folder = `logos/${membership.organizationId}/`;

  const [before] = await db
    .select({ logoUrl: organizations.logoUrl })
    .from(organizations)
    .where(eq(organizations.id, membership.organizationId))
    .limit(1);

  let logoUrl: string;

  try {
    logoUrl = await uploadImage(`${folder}logo`, image);
  } catch (error) {
    console.error("Logo upload failed:", error);
    return { error: "The upload failed. Please try again." };
  }

  try {
    await db
      .update(organizations)
      .set({ logoUrl })
      .where(eq(organizations.id, membership.organizationId));
  } catch (error) {
    await deleteOwnedBlob(logoUrl, folder);
    throw error;
  }

  await deleteOwnedBlob(before?.logoUrl, folder);

  await logAudit({
    organizationId: membership.organizationId,
    userId: membership.userId,
    module: "organization",
    action: "organization.logo_updated",
    recordId: membership.organizationId,
    previousValue: { logoUrl: before?.logoUrl ?? null },
    newValue: { logoUrl },
  });

  return { success: true, logoUrl };
}

export async function removeLogoAction() {
  const membership = await getSessionMembership();

  if (!membership) {
    return { error: "You need to sign in and create an organization first." };
  }

  if (!canManageTeam(membership.role)) {
    return { error: "Only an Owner or Administrator can do this." };
  }

  const [before] = await db
    .select({ logoUrl: organizations.logoUrl })
    .from(organizations)
    .where(eq(organizations.id, membership.organizationId))
    .limit(1);

  if (!before?.logoUrl) {
    return { success: true };
  }

  await db
    .update(organizations)
    .set({ logoUrl: null })
    .where(eq(organizations.id, membership.organizationId));

  await deleteOwnedBlob(before.logoUrl, `logos/${membership.organizationId}/`);

  await logAudit({
    organizationId: membership.organizationId,
    userId: membership.userId,
    module: "organization",
    action: "organization.logo_removed",
    recordId: membership.organizationId,
    previousValue: { logoUrl: before.logoUrl },
    newValue: { logoUrl: null },
  });

  return { success: true };
}

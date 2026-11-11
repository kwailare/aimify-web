import { NextResponse } from "next/server";
import { verifyApiToken } from "@/lib/api-auth";
import { getOrgContextForUser } from "@/lib/org";
import { legacyPermissions } from "@/lib/permissions";
import { getPermissionsFor } from "@/lib/role-permissions";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { plans } from "@/db/schema";
import { getOrgPlan, getUsage } from "@/lib/plans";
import { whatsappProvider } from "@/lib/whatsapp";
import { readWhatsAppSettings } from "@/lib/whatsapp/settings";

export async function GET(request: Request) {
  const userId = await verifyApiToken(request);

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const context = await getOrgContextForUser(userId);

  if (!context) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const organizationId = context.membership?.organization.id;
  const scheduledPlanId = context.membership?.organization.scheduledPlanId;
  const [plan, usage, permissions, [scheduledPlan]] = await Promise.all([
    organizationId ? getOrgPlan(organizationId) : null,
    organizationId ? getUsage(organizationId) : null,
    getPermissionsFor(organizationId, context.membership?.role),
    scheduledPlanId
      ? db.select({ name: plans.name, priceMonthly: plans.priceMonthly }).from(plans).where(eq(plans.id, scheduledPlanId))
      : [],
  ]);
  const scheduledAt = context.membership?.organization.scheduledPlanAt;

  return NextResponse.json({
    user: {
      id: context.user.id,
      name: context.user.name,
      email: context.user.email,
      phone: context.user.phone,
      emailVerified: Boolean(context.user.emailVerifiedAt),
    },
    organization: context.membership
      ? {
          id: context.membership.organization.id,
          name: context.membership.organization.name,
          industry: context.membership.organization.industry,
          currency: context.membership.organization.currency,
          warehouseName: context.membership.organization.warehouseName,
          logoUrl: context.membership.organization.logoUrl,
          currentPeriodEnd: context.membership.organization.currentPeriodEnd,
          cancelAtPeriodEnd: context.membership.organization.cancelAtPeriodEnd,
          registrationNumber: context.membership.organization.registrationNumber,
          address: context.membership.organization.address,
          phone: context.membership.organization.phone,
          email: context.membership.organization.email,
          taxName: context.membership.organization.taxName,
          taxRate: context.membership.organization.taxRate,
          timezone: context.membership.organization.timezone,
          dateFormat: context.membership.organization.dateFormat,
          subscriptionStatus: context.membership.organization.subscriptionStatus,
          trialEndsAt: context.membership.organization.trialEndsAt,
          setupCompletedAt: context.membership.organization.setupCompletedAt,
        }
      : null,
    // Automatic WhatsApp messages: connected only with the real provider
    // (test mode records, it doesn't send), and which ones the business
    // turned on. The app opens WhatsApp itself when they aren't sent.
    whatsapp: context.membership
      ? {
          connected: whatsappProvider()?.id === "meta",
          ...readWhatsAppSettings(context.membership.organization.whatsappSettings),
        }
      : null,
    role: context.membership?.role ?? null,
    permissions: [...permissions, ...legacyPermissions(permissions)],
    plan: plan
      ? {
          name: plan.name,
          priceMonthly: plan.priceMonthly,
          // A cheaper plan starting when the paid period ends.
          scheduled:
            scheduledPlan && scheduledAt
              ? { name: scheduledPlan.name, priceMonthly: scheduledPlan.priceMonthly, at: scheduledAt }
              : null,
          limits: {
            users: plan.maxUsers,
            warehouses: plan.maxWarehouses,
            products: plan.maxProducts,
          },
          usage: {
            users: usage?.users ?? 0,
            warehouses: usage?.warehouses ?? 0,
            products: usage?.products ?? 0,
          },
        }
      : null,
  });
}

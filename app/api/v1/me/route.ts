import { NextResponse } from "next/server";
import { verifyApiToken } from "@/lib/api-auth";
import { getOrgContextForUser } from "@/lib/org";

export async function GET(request: Request) {
  const userId = await verifyApiToken(request);

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const context = await getOrgContextForUser(userId);

  if (!context) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  return NextResponse.json({
    user: {
      id: context.user.id,
      name: context.user.name,
      email: context.user.email,
      phone: context.user.phone,
    },
    organization: context.membership
      ? {
          id: context.membership.organization.id,
          name: context.membership.organization.name,
          industry: context.membership.organization.industry,
          currency: context.membership.organization.currency,
          warehouseName: context.membership.organization.warehouseName,
          logoUrl: context.membership.organization.logoUrl,
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
        }
      : null,
    role: context.membership?.role ?? null,
  });
}

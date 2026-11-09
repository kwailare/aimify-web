"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations, users } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { getOrgContext } from "@/lib/org";
import { canManageTeam } from "@/lib/roles";
import { toWhatsAppNumber } from "@/lib/whatsapp/phone";
import { type WhatsAppSettings, readWhatsAppSettings } from "@/lib/whatsapp/settings";

/** Which automatic WhatsApp messages the business sends (Owner and Administrators). */
export async function saveWhatsAppSettingsAction(input: WhatsAppSettings) {
  const context = await getOrgContext();
  if (!context?.membership) return { error: "You need to sign in first." };
  const { organization, role } = context.membership;
  if (!canManageTeam(role)) return { error: "Only an Owner or Administrator can change WhatsApp messages." };

  const before = readWhatsAppSettings(organization.whatsappSettings);
  const settings = readWhatsAppSettings(input);
  await db.update(organizations).set({ whatsappSettings: settings }).where(eq(organizations.id, organization.id));
  await logAudit({
    organizationId: organization.id,
    userId: context.user.id,
    module: "organization",
    action: "organization.whatsapp_settings_changed",
    recordId: organization.id,
    previousValue: before,
    newValue: settings,
  });
  return { success: true };
}

/** Whether the signed-in person gets stock alerts on WhatsApp. */
export async function setMyWhatsAppAlertsAction(on: boolean) {
  const context = await getOrgContext();
  if (!context?.membership) return { error: "You need to sign in first." };
  if (on && !toWhatsAppNumber(context.user.phone)) {
    return { error: "Add your phone number in Settings first; alerts go to that number." };
  }
  await db.update(users).set({ whatsappAlerts: on === true }).where(eq(users.id, context.user.id));
  await logAudit({
    organizationId: context.membership.organization.id,
    userId: context.user.id,
    module: "account",
    action: on ? "account.whatsapp_alerts_on" : "account.whatsapp_alerts_off",
    recordId: context.user.id,
  });
  return { success: true };
}

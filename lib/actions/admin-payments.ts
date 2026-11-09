"use server";

import { getAdminContext } from "@/lib/admin";
import { logAudit } from "@/lib/audit";
import { PaymentProviderError, activeProviderId, isProviderId, setActiveProvider } from "@/lib/payments";

/**
 * Makes [id] the payment provider new payments go through. Saved cards keep
 * renewing with the provider that saved them.
 */
export async function setActiveProviderAction(id: string) {
  const context = await getAdminContext();
  if (!context) return { error: "Not authorized." };
  if (!isProviderId(id)) return { error: "Unknown payment provider." };

  const before = await activeProviderId();
  try {
    await setActiveProvider(id, context.admin.id);
  } catch (error) {
    if (error instanceof PaymentProviderError) return { error: error.message };
    throw error;
  }

  await logAudit({
    userId: context.admin.id,
    module: "admin",
    action: "admin.payment_provider_changed",
    recordId: id,
    previousValue: { provider: before },
    newValue: { provider: id },
  });

  return { success: true };
}

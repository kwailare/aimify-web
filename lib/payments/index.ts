import { eq } from "drizzle-orm";
import { db } from "@/db";
import { platformSettings } from "@/db/schema";
import { paystack } from "@/lib/payments/paystack";
import { PROVIDER_IDS, type PaymentProvider, PaymentProviderError, type ProviderId } from "@/lib/payments/types";

export * from "@/lib/payments/types";

// Every payment provider Aimify can use. To add one (Flutterwave...):
// write lib/payments/<id>.ts implementing PaymentProvider, add its id to
// PROVIDER_IDS and to this list, and set its keys. Its webhook then lives
// at /api/webhooks/<id>.
const PROVIDERS: Record<ProviderId, PaymentProvider> = { paystack };

const ACTIVE_KEY = "payments.activeProvider";
const DEFAULT_PROVIDER: ProviderId = "paystack";

export function isProviderId(value: unknown): value is ProviderId {
  return (PROVIDER_IDS as readonly unknown[]).includes(value);
}

export function listProviders() {
  return PROVIDER_IDS.map((id) => PROVIDERS[id]);
}

/** The provider [id] names; payments and saved cards record it. */
export function getProvider(id: string | null | undefined): PaymentProvider {
  if (!isProviderId(id)) {
    throw new PaymentProviderError(`Unknown payment provider "${id}".`, "not_configured");
  }
  return PROVIDERS[id];
}

/** Whether any provider can take payments at all. */
export function anyProviderConfigured() {
  return listProviders().some((p) => p.isConfigured());
}

/** The provider the Aimify team chose for new payments (Paystack until then). */
export async function activeProviderId(): Promise<ProviderId> {
  const [row] = await db
    .select({ value: platformSettings.value })
    .from(platformSettings)
    .where(eq(platformSettings.key, ACTIVE_KEY))
    .limit(1);
  return isProviderId(row?.value) ? row.value : DEFAULT_PROVIDER;
}

export async function activeProvider() {
  return PROVIDERS[await activeProviderId()];
}

/** Makes [id] the provider for new payments. Saved cards keep theirs. */
export async function setActiveProvider(id: ProviderId, userId: string) {
  if (!PROVIDERS[id].isConfigured()) {
    throw new PaymentProviderError(`${PROVIDERS[id].name} has no keys set, so it can't take payments.`, "not_configured");
  }
  await db
    .insert(platformSettings)
    .values({ key: ACTIVE_KEY, value: id, updatedBy: userId, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: platformSettings.key,
      set: { value: id, updatedBy: userId, updatedAt: new Date() },
    });
}

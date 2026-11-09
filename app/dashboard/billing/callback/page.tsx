import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { payments } from "@/db/schema";
import { applyTransaction } from "@/lib/billing";
import { getOrgContext } from "@/lib/org";
import { PaymentProviderError, getProvider } from "@/lib/payments";

export const dynamic = "force-dynamic";

export default async function BillingCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string; trxref?: string; tx_ref?: string }>;
}) {
  const params = await searchParams;
  // Providers name it differently (Paystack: reference or trxref).
  const reference = params.reference ?? params.trxref ?? params.tx_ref ?? "";
  const context = await getOrgContext();

  if (!context?.membership) {
    redirect("/signin");
  }

  const organizationId = context.membership.organization.id;

  if (!reference) {
    redirect("/dashboard/billing?payment=missing");
  }

  const [payment] = await db
    .select({ id: payments.id, provider: payments.provider })
    .from(payments)
    .where(
      and(
        eq(payments.providerReference, reference),
        eq(payments.organizationId, organizationId),
      ),
    )
    .limit(1);

  if (!payment) {
    redirect("/dashboard/billing?payment=missing");
  }

  let result: string;

  try {
    const transaction = await getProvider(payment.provider).verify(reference);
    const applied = await applyTransaction(transaction);
    result =
      applied.outcome === "activated" || applied.outcome === "already"
        ? "success"
        : applied.outcome === "pending"
          ? "pending"
          : "failed";
  } catch (error) {
    result = error instanceof PaymentProviderError && error.kind === "network" ? "pending" : "failed";
  }

  redirect(`/dashboard/billing?payment=${result}`);
}

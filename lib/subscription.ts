export const SUBSCRIPTION_STATUSES = [
  "pending",
  "trial",
  "active",
  "past_due",
  "expired",
  "cancelled",
  "suspended",
] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

const PRODUCT_ACCESS = new Set<string>(["trial", "active", "past_due"]);
const CANCELLABLE = new Set<string>(["trial", "active", "past_due"]);

export function hasProductAccess(status: string) {
  return PRODUCT_ACCESS.has(status);
}

export function canCancelSubscription(status: string) {
  return CANCELLABLE.has(status);
}

const LABELS: Record<string, string> = {
  pending: "Pending",
  trial: "Trial",
  active: "Active",
  past_due: "Past due",
  expired: "Expired",
  cancelled: "Cancelled",
  suspended: "Suspended",
};

export function describeSubscriptionStatus(status: string) {
  return LABELS[status] ?? status;
}

const BLOCKED_MESSAGES: Record<string, string> = {
  pending:
    "Finish setting up your subscription on the Aimify website to use the desktop app.",
  expired:
    "Your free trial has ended. Subscribe on the Aimify website to keep using the desktop app.",
  cancelled:
    "Your subscription was cancelled. Reactivate it on the Aimify website to keep using the desktop app.",
  suspended:
    "This organization has been suspended. Contact support@aimify.app for help.",
};

export function blockedMessage(status: string) {
  return (
    BLOCKED_MESSAGES[status] ??
    "Your subscription is not active. Manage it on the Aimify website."
  );
}

export function effectiveStatus(status: string, trialEndsAt: Date | null) {
  if (status === "trial" && trialEndsAt && trialEndsAt <= new Date()) {
    return "expired";
  }

  return status;
}

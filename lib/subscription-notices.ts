import { and, eq, gt, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/db";
import {
  memberships,
  organizations,
  subscriptionNotices,
  users,
} from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { SITE_URL } from "@/lib/site";

const DAY = 24 * 60 * 60 * 1000;
const EXPIRED_NOTICE_WINDOW = 7 * DAY;
const BILLING_URL = `${SITE_URL}/dashboard/billing`;

export type NoticeKind =
  | "trial_ending_3d"
  | "trial_ending_1d"
  | "trial_expired";

export type ChangeKind =
  | "suspended"
  | "reactivated"
  | "trial_extended"
  | "activated"
  | "cancelled";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatLongDate(date: Date) {
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Africa/Lagos",
  });
}

export async function getBillingRecipients(organizationId: string) {
  const rows = await db
    .select({ email: users.email, name: users.name, role: memberships.role })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(
      and(
        eq(memberships.organizationId, organizationId),
        inArray(memberships.role, ["Owner", "Administrator"]),
      ),
    );

  return rows.filter((row) => row.email);
}

function layout(organizationName: string, lines: string[], cta: string) {
  const text = `${lines.join("\n\n")}\n\n${cta}: ${BILLING_URL}\n\nYou're receiving this because you're an Owner or Administrator of ${organizationName} on Aimify.`;
  const html = `${lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}<p><a href="${BILLING_URL}">${escapeHtml(cta)}</a></p><p style="color:#666;font-size:12px">You're receiving this because you're an Owner or Administrator of ${escapeHtml(organizationName)} on Aimify.</p>`;

  return { text, html };
}

function noticeContent(
  kind: NoticeKind,
  organizationName: string,
  trialEndsAt: Date,
) {
  const when = formatLongDate(trialEndsAt);

  if (kind === "trial_expired") {
    return {
      subject: `Your Aimify trial for ${organizationName} has ended`,
      ...layout(
        organizationName,
        [
          `The free trial for ${organizationName} ended on ${when}, so the desktop app is locked for now. Your data is safe and nothing has been deleted.`,
          "Subscribe to pick up where you left off. Aimify is ₦25,000 per month.",
        ],
        "Open billing",
      ),
    };
  }

  const days = kind === "trial_ending_1d" ? "tomorrow" : "in 3 days";

  return {
    subject: `Your Aimify trial for ${organizationName} ends ${days}`,
    ...layout(
      organizationName,
      [
        `The free trial for ${organizationName} ends ${days}, on ${when}.`,
        "After that the desktop app locks until you subscribe. Aimify is ₦25,000 per month, and your data stays safe either way.",
      ],
      "Manage your subscription",
    ),
  };
}

async function claimNotice(
  organizationId: string,
  kind: NoticeKind,
  period: string,
) {
  const [claimed] = await db
    .insert(subscriptionNotices)
    .values({ organizationId, kind, period })
    .onConflictDoNothing()
    .returning({ id: subscriptionNotices.id });

  return claimed?.id ?? null;
}

async function sendNotice(
  organization: { id: string; name: string; trialEndsAt: Date },
  kind: NoticeKind,
) {
  const period = organization.trialEndsAt.toISOString();
  const claimId = await claimNotice(organization.id, kind, period);

  if (!claimId) return "skipped" as const;

  const recipients = await getBillingRecipients(organization.id);

  if (recipients.length === 0) {
    await db
      .delete(subscriptionNotices)
      .where(eq(subscriptionNotices.id, claimId));
    return "no_recipients" as const;
  }

  const content = noticeContent(kind, organization.name, organization.trialEndsAt);
  const sent = await sendEmail({
    to: recipients.map((recipient) => recipient.email),
    ...content,
  });

  if (!sent) {
    await db
      .delete(subscriptionNotices)
      .where(eq(subscriptionNotices.id, claimId));
    return "failed" as const;
  }

  await logAudit({
    organizationId: organization.id,
    module: "subscription",
    action: "subscription.notice_sent",
    recordId: organization.id,
    newValue: { kind, recipients: recipients.length },
  });

  return "sent" as const;
}

export async function runSubscriptionNotices(now = new Date()) {
  const summary = {
    expired: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    noRecipients: 0,
  };

  const lapsed = await db
    .update(organizations)
    .set({ subscriptionStatus: "expired" })
    .where(
      and(
        eq(organizations.subscriptionStatus, "trial"),
        lte(organizations.trialEndsAt, now),
      ),
    )
    .returning({ id: organizations.id });

  for (const org of lapsed) {
    summary.expired += 1;
    await logAudit({
      organizationId: org.id,
      module: "subscription",
      action: "subscription.expired",
      recordId: org.id,
      previousValue: { subscriptionStatus: "trial" },
      newValue: { subscriptionStatus: "expired" },
    });
  }

  const ending = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      trialEndsAt: organizations.trialEndsAt,
    })
    .from(organizations)
    .where(
      and(
        eq(organizations.subscriptionStatus, "trial"),
        gt(organizations.trialEndsAt, now),
        lte(organizations.trialEndsAt, new Date(now.getTime() + 3 * DAY)),
      ),
    );

  const justExpired = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      trialEndsAt: organizations.trialEndsAt,
    })
    .from(organizations)
    .where(
      and(
        eq(organizations.subscriptionStatus, "expired"),
        gte(
          organizations.trialEndsAt,
          new Date(now.getTime() - EXPIRED_NOTICE_WINDOW),
        ),
        lte(organizations.trialEndsAt, now),
      ),
    );

  const jobs: {
    org: { id: string; name: string; trialEndsAt: Date };
    kind: NoticeKind;
  }[] = [];

  for (const org of ending) {
    if (!org.trialEndsAt) continue;
    const kind: NoticeKind =
      org.trialEndsAt.getTime() - now.getTime() <= DAY
        ? "trial_ending_1d"
        : "trial_ending_3d";
    jobs.push({ org: { ...org, trialEndsAt: org.trialEndsAt }, kind });
  }

  for (const org of justExpired) {
    if (!org.trialEndsAt) continue;
    jobs.push({
      org: { ...org, trialEndsAt: org.trialEndsAt },
      kind: "trial_expired",
    });
  }

  for (const job of jobs) {
    const result = await sendNotice(job.org, job.kind);

    if (result === "sent") summary.sent += 1;
    else if (result === "skipped") summary.skipped += 1;
    else if (result === "failed") summary.failed += 1;
    else summary.noRecipients += 1;
  }

  return summary;
}

const CHANGE_COPY: Record<
  ChangeKind,
  (name: string, detail?: string) => { subject: string; lines: string[] }
> = {
  suspended: (name) => ({
    subject: `${name} has been suspended on Aimify`,
    lines: [
      `Access for ${name} has been suspended by the Aimify team, so the website dashboard and the desktop app are locked.`,
      "If you think this is a mistake, reply to this email or contact support@aimify.app.",
    ],
  }),
  reactivated: (name) => ({
    subject: `${name} is active on Aimify again`,
    lines: [
      `Access for ${name} has been restored. You can sign in to the dashboard and the desktop app again.`,
    ],
  }),
  trial_extended: (name, detail) => ({
    subject: `Your Aimify trial for ${name} was extended`,
    lines: [
      `The Aimify team extended the free trial for ${name}${detail ? `, now running until ${detail}` : ""}.`,
    ],
  }),
  activated: (name) => ({
    subject: `Your Aimify subscription for ${name} is active`,
    lines: [
      `The Aimify team activated the subscription for ${name}. Everything is unlocked, in the dashboard and the desktop app.`,
    ],
  }),
  cancelled: (name) => ({
    subject: `The Aimify subscription for ${name} was cancelled`,
    lines: [
      `The subscription for ${name} was cancelled, so the desktop app is locked. Your data is safe and you can subscribe again at any time.`,
    ],
  }),
};

export async function notifySubscriptionChange(
  organizationId: string,
  kind: ChangeKind,
  detail?: string,
) {
  const [organization] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!organization) return false;

  const recipients = await getBillingRecipients(organizationId);

  if (recipients.length === 0) return false;

  const copy = CHANGE_COPY[kind](organization.name, detail);

  return sendEmail({
    to: recipients.map((recipient) => recipient.email),
    subject: copy.subject,
    ...layout(organization.name, copy.lines, "Open billing"),
  });
}

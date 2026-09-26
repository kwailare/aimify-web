"use server";

import { auth } from "@/auth";
import { logAudit } from "@/lib/audit";
import {
  describeDevice,
  listSessions,
  revokeAllSessions,
  revokeSession,
} from "@/lib/sessions";

export type DeviceRow = {
  id: string;
  kind: string;
  device: string;
  ip: string | null;
  createdAt: string;
  lastSeenAt: string;
  isCurrent: boolean;
};

export async function listMySessionsAction() {
  const session = await auth();

  if (!session?.user?.id) {
    return { error: "You need to sign in first." };
  }

  const rows = await listSessions(session.user.id);
  const currentId = session.user.sessionId ?? null;

  const devices: DeviceRow[] = rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    device: describeDevice(row.userAgent, row.deviceName),
    ip: row.ip,
    createdAt: row.createdAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    isCurrent: row.id === currentId,
  }));

  return { devices, hasCurrent: devices.some((device) => device.isCurrent) };
}

export async function revokeMySessionAction(sessionId: string) {
  const session = await auth();

  if (!session?.user?.id) {
    return { error: "You need to sign in first." };
  }

  if (sessionId === session.user.sessionId) {
    return { error: "Use Sign out to end this device's session." };
  }

  const revoked = await revokeSession(session.user.id, sessionId);

  if (!revoked) {
    return { error: "That device is already signed out." };
  }

  await logAudit({
    userId: session.user.id,
    module: "auth",
    action: "user.session_revoked",
    recordId: sessionId,
  });

  return { success: true };
}

export async function revokeOtherSessionsAction() {
  const session = await auth();

  if (!session?.user?.id) {
    return { error: "You need to sign in first." };
  }

  const count = await revokeAllSessions(session.user.id, {
    exceptSessionId: session.user.sessionId,
  });

  await logAudit({
    userId: session.user.id,
    module: "auth",
    action: "user.sessions_revoked",
    recordId: session.user.id,
    newValue: { devicesSignedOut: count },
  });

  return { success: true, count };
}

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  listMySessionsAction,
  revokeMySessionAction,
  revokeOtherSessionsAction,
  type DeviceRow,
} from "@/lib/actions/sessions";
import { formatDateTime } from "@/lib/format-date";

type Notice = { kind: "error" | "success"; text: string } | null;

export function SignedInDevices() {
  const [devices, setDevices] = useState<DeviceRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const apply = useCallback(
    (result: Awaited<ReturnType<typeof listMySessionsAction>>) => {
      if ("error" in result && result.error) {
        setNotice({ kind: "error", text: result.error });
        setDevices([]);
        return;
      }

      setDevices(result.devices ?? []);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    listMySessionsAction().then((result) => {
      if (!cancelled) apply(result);
    });

    return () => {
      cancelled = true;
    };
  }, [apply]);

  const run = async (
    key: string,
    action: () => Promise<{ error?: string; success?: boolean }>,
    successText: string,
  ) => {
    setNotice(null);
    setBusy(key);

    const result = await action();

    setBusy(null);

    if (result?.error) {
      setNotice({ kind: "error", text: result.error });
      return;
    }

    setNotice({ kind: "success", text: successText });
    apply(await listMySessionsAction());
  };

  const others = (devices ?? []).filter((device) => !device.isCurrent);

  return (
    <div className="dash-card">
      <div className="admin-stat-row">
        <p className="dash-card-label">Signed-in devices</p>
        {others.length > 0 && (
          <button
            className="dash-table-action is-danger"
            type="button"
            disabled={busy !== null}
            onClick={() =>
              run(
                "all",
                revokeOtherSessionsAction,
                "Signed out of every other device.",
              )
            }
          >
            {busy === "all" ? "Working…" : "Sign out other devices"}
          </button>
        )}
      </div>
      <p className="dash-card-note">
        Browsers and desktop apps currently signed in to your account.
        Changing your password signs out every other device automatically.
      </p>

      {notice && (
        <p
          className={notice.kind === "error" ? "auth-error" : "auth-success"}
          role={notice.kind === "error" ? "alert" : "status"}
        >
          {notice.text}
        </p>
      )}

      {devices === null ? (
        <p className="dash-card-note">Loading…</p>
      ) : devices.length === 0 ? (
        <p className="dash-card-note">No active devices found.</p>
      ) : (
        <ul className="admin-feed">
          {devices.map((device) => (
            <li key={device.id}>
              <span className="admin-stack">
                <span>
                  {device.device}{" "}
                  <span className="dash-badge is-upcoming">
                    {device.kind === "desktop" ? "Desktop app" : "Website"}
                  </span>{" "}
                  {device.isCurrent && (
                    <span className="dash-badge is-active">This device</span>
                  )}
                </span>
                <span className="admin-subline" suppressHydrationWarning>
                  {device.ip ? `${device.ip} · ` : ""}
                  Last active {formatDateTime(device.lastSeenAt)} · Signed in{" "}
                  {formatDateTime(device.createdAt)}
                </span>
              </span>
              {!device.isCurrent && (
                <button
                  className="dash-table-action is-danger"
                  type="button"
                  disabled={busy !== null}
                  onClick={() =>
                    run(
                      device.id,
                      () => revokeMySessionAction(device.id),
                      `${device.device} was signed out.`,
                    )
                  }
                >
                  {busy === device.id ? "Working…" : "Sign out"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

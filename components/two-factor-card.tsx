"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { PasswordInput } from "@/components/password-input";
import {
  confirmTwoFactorSetupAction,
  disableTwoFactorAction,
  getTwoFactorStatusAction,
  regenerateBackupCodesAction,
  startTwoFactorSetupAction,
} from "@/lib/actions/two-factor";
import { formatDate } from "@/lib/format-date";

type Status = {
  enabled: boolean;
  pending: boolean;
  enabledAt: Date | string | null;
  backupCodesRemaining: number;
};

type Notice = { kind: "error" | "success"; text: string } | null;
type Mode = "idle" | "setup" | "disable" | "regenerate";

export function TwoFactorCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [mode, setMode] = useState<Mode>("idle");
  const [setup, setSetup] = useState<{ qr: string; secret: string } | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const apply = useCallback(
    (result: Awaited<ReturnType<typeof getTwoFactorStatusAction>>) => {
      if ("status" in result && result.status) setStatus(result.status);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    getTwoFactorStatusAction().then((result) => {
      if (!cancelled) apply(result);
    });

    return () => {
      cancelled = true;
    };
  }, [apply]);

  const refresh = async () => apply(await getTwoFactorStatusAction());

  const startSetup = async () => {
    setNotice(null);
    setBusy(true);

    const result = await startTwoFactorSetupAction();

    setBusy(false);

    if ("error" in result && result.error) {
      setNotice({ kind: "error", text: result.error });
      return;
    }

    if ("qr" in result && result.qr && result.secret) {
      setSetup({ qr: result.qr, secret: result.secret });
      setMode("setup");
    }
  };

  const submitConfirm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    setNotice(null);
    setBusy(true);

    const result = await confirmTwoFactorSetupAction(String(form.get("code") ?? ""));

    setBusy(false);

    if ("error" in result && result.error) {
      setNotice({ kind: "error", text: result.error });
      return;
    }

    if ("backupCodes" in result && result.backupCodes) {
      setBackupCodes(result.backupCodes);
      setSetup(null);
      setMode("idle");
      setNotice({ kind: "success", text: "Two-factor authentication is on." });
      await refresh();
    }
  };

  const submitDisable = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    setNotice(null);
    setBusy(true);

    const result = await disableTwoFactorAction(
      String(form.get("password") ?? ""),
      String(form.get("code") ?? ""),
    );

    setBusy(false);

    if ("error" in result && result.error) {
      setNotice({ kind: "error", text: result.error });
      return;
    }

    setMode("idle");
    setBackupCodes(null);
    setNotice({ kind: "success", text: "Two-factor authentication is off." });
    await refresh();
  };

  const submitRegenerate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    setNotice(null);
    setBusy(true);

    const result = await regenerateBackupCodesAction(String(form.get("code") ?? ""));

    setBusy(false);

    if ("error" in result && result.error) {
      setNotice({ kind: "error", text: result.error });
      return;
    }

    if ("backupCodes" in result && result.backupCodes) {
      setBackupCodes(result.backupCodes);
      setMode("idle");
      setNotice({ kind: "success", text: "New backup codes created. The old ones no longer work." });
      await refresh();
    }
  };

  const cancel = () => {
    setMode("idle");
    setSetup(null);
    setNotice(null);
  };

  return (
    <div className="dash-card">
      <div className="admin-stat-row">
        <p className="dash-card-label">Two-factor authentication</p>
        {status && (
          <span
            className={`dash-badge ${status.enabled ? "is-active" : "is-upcoming"}`}
          >
            {status.enabled ? "On" : "Off"}
          </span>
        )}
      </div>
      <p className="dash-card-note">
        Add a second step at sign-in: a 6-digit code from an authenticator app
        such as Google Authenticator, Microsoft Authenticator or Authy. It
        protects your account even if your password leaks.
      </p>

      {notice && (
        <p
          className={notice.kind === "error" ? "auth-error" : "auth-success"}
          role={notice.kind === "error" ? "alert" : "status"}
        >
          {notice.text}
        </p>
      )}

      {backupCodes && (
        <div className="two-factor-panel">
          <p className="admin-detail-title">Your backup codes</p>
          <p className="admin-subline">
            Save these somewhere safe. Each works once if you lose your phone,
            and they won&apos;t be shown again.
          </p>
          <ul className="two-factor-codes" aria-label="Backup codes">
            {backupCodes.map((code) => (
              <li key={code}>{code}</li>
            ))}
          </ul>
          <div className="dash-inline-actions">
            <button
              className="dash-table-action"
              type="button"
              onClick={() => navigator.clipboard?.writeText(backupCodes.join("\n"))}
            >
              Copy codes
            </button>
            <button
              className="dash-table-action is-positive"
              type="button"
              onClick={() => setBackupCodes(null)}
            >
              I&apos;ve saved them
            </button>
          </div>
        </div>
      )}

      {status && !status.enabled && mode === "idle" && (
        <div className="dash-inline-actions">
          <button
            className="auth-submit dash-submit"
            type="button"
            disabled={busy}
            onClick={startSetup}
          >
            {busy ? "Preparing…" : "Set up two-factor"}
          </button>
        </div>
      )}

      {mode === "setup" && setup && (
        <form className="two-factor-panel" onSubmit={submitConfirm}>
          <p className="admin-detail-title">1. Scan this code</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="two-factor-qr"
            src={setup.qr}
            width={220}
            height={220}
            alt="QR code to add Aimify to your authenticator app"
          />
          <p className="admin-subline">
            Can&apos;t scan? Enter this key in your app instead:{" "}
            <code className="two-factor-secret">{setup.secret}</code>
          </p>
          <p className="admin-detail-title">2. Enter the 6-digit code</p>
          <div className="auth-field">
            <label className="auth-label" htmlFor="tf-confirm-code">
              Code from your app
            </label>
            <input
              className="auth-input"
              id="tf-confirm-code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              required
            />
          </div>
          <div className="dash-inline-actions">
            <button className="auth-submit dash-submit" type="submit" disabled={busy}>
              {busy ? "Checking…" : "Turn on two-factor"}
            </button>
            <button className="dash-table-action" type="button" onClick={cancel} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {status?.enabled && mode === "idle" && (
        <>
          <p className="dash-card-note" suppressHydrationWarning>
            {status.enabledAt ? `Turned on ${formatDate(status.enabledAt)}. ` : ""}
            {status.backupCodesRemaining} backup{" "}
            {status.backupCodesRemaining === 1 ? "code" : "codes"} left.
          </p>
          <div className="dash-inline-actions">
            <button className="dash-table-action" type="button" onClick={() => { setNotice(null); setMode("regenerate"); }}>
              New backup codes
            </button>
            <button className="dash-table-action is-danger" type="button" onClick={() => { setNotice(null); setMode("disable"); }}>
              Turn off
            </button>
          </div>
        </>
      )}

      {mode === "regenerate" && (
        <form className="two-factor-panel" onSubmit={submitRegenerate}>
          <p className="admin-subline">
            Enter a current code from your app to create 10 new backup codes.
            The old ones stop working.
          </p>
          <div className="auth-field">
            <label className="auth-label" htmlFor="tf-regen-code">
              Code from your app
            </label>
            <input className="auth-input" id="tf-regen-code" name="code" inputMode="numeric" autoComplete="one-time-code" required />
          </div>
          <div className="dash-inline-actions">
            <button className="auth-submit dash-submit" type="submit" disabled={busy}>
              {busy ? "Working…" : "Create new codes"}
            </button>
            <button className="dash-table-action" type="button" onClick={cancel} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {mode === "disable" && (
        <form className="two-factor-panel" onSubmit={submitDisable}>
          <p className="admin-subline">
            Turning this off makes your account easier to break into. Confirm
            with your password and a current code. Your other devices will be
            signed out.
          </p>
          <PasswordInput label="Password" name="password" autoComplete="current-password" />
          <div className="auth-field">
            <label className="auth-label" htmlFor="tf-disable-code">
              Code from your app (or a backup code)
            </label>
            <input className="auth-input" id="tf-disable-code" name="code" autoComplete="one-time-code" required />
          </div>
          <div className="dash-inline-actions">
            <button className="auth-submit dash-submit" type="submit" disabled={busy}>
              {busy ? "Working…" : "Turn off two-factor"}
            </button>
            <button className="dash-table-action" type="button" onClick={cancel} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

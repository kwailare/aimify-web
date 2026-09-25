"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { signOut } from "next-auth/react";
import { PasswordInput } from "@/components/password-input";
import { useDashboardContext } from "@/components/dashboard-context";
import { changePasswordAction, updateProfileAction } from "@/lib/actions/account";

type Notice = { kind: "error" | "success"; text: string } | null;

function NoticeMessage({ notice }: { notice: Notice }) {
  if (!notice) return null;

  return (
    <p
      className={notice.kind === "error" ? "auth-error" : "auth-success"}
      role={notice.kind === "error" ? "alert" : "status"}
    >
      {notice.text}
    </p>
  );
}

export default function DashboardSettingsPage() {
  const router = useRouter();
  const { user, role } = useDashboardContext();

  const [profileNotice, setProfileNotice] = useState<Notice>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState<Notice>(null);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const handleSignOut = async () => {
    await signOut({ redirectTo: "/signin" });
  };

  const handleProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfileNotice(null);
    setIsSavingProfile(true);

    const result = await updateProfileAction(new FormData(event.currentTarget));

    setIsSavingProfile(false);

    if (result?.error) {
      setProfileNotice({ kind: "error", text: result.error });
      return;
    }

    setProfileNotice({ kind: "success", text: "Profile saved." });
    router.refresh();
  };

  const handlePasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordNotice(null);

    const form = event.currentTarget;
    const formData = new FormData(form);

    if (formData.get("newPassword") !== formData.get("confirmPassword")) {
      setPasswordNotice({
        kind: "error",
        text: "The new passwords don't match.",
      });
      return;
    }

    setIsSavingPassword(true);

    const result = await changePasswordAction(formData);

    setIsSavingPassword(false);

    if (result?.error) {
      setPasswordNotice({ kind: "error", text: result.error });
      return;
    }

    form.reset();
    setPasswordNotice({ kind: "success", text: "Password updated." });
  };

  return (
    <div className="dash-stack">
      <div>
        <p className="dash-page-eyebrow">Settings</p>
        <h1 className="dash-page-title">Account settings</h1>
        <p className="dash-page-subtitle">
          Update your profile and manage sign-in security.
        </p>
      </div>

      <form className="dash-card dash-form" onSubmit={handleProfileSubmit}>
        <p className="dash-card-label">Profile</p>
        <div className="auth-field-row">
          <div className="auth-field">
            <label className="auth-label" htmlFor="settings-name">
              Full name
            </label>
            <input
              className="auth-input"
              id="settings-name"
              name="name"
              type="text"
              autoComplete="name"
              defaultValue={user.name}
              required
            />
          </div>
          <div className="auth-field">
            <label className="auth-label" htmlFor="settings-phone">
              Phone number
            </label>
            <input
              className="auth-input"
              id="settings-phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              defaultValue={user.phone ?? ""}
              required
            />
          </div>
        </div>
        <div className="auth-field-row">
          <div className="auth-field">
            <label className="auth-label" htmlFor="settings-email">
              Work email
            </label>
            <input
              className="auth-input"
              id="settings-email"
              type="email"
              defaultValue={user.email}
              disabled
            />
          </div>
          <div className="auth-field">
            <label className="auth-label" htmlFor="settings-role">
              Role
            </label>
            <input
              className="auth-input"
              id="settings-role"
              type="text"
              defaultValue={role}
              disabled
            />
          </div>
        </div>
        <NoticeMessage notice={profileNotice} />
        <button
          className="auth-submit dash-submit"
          type="submit"
          disabled={isSavingProfile}
        >
          {isSavingProfile ? "Saving…" : "Save profile"}
        </button>
      </form>

      <form className="dash-card dash-form" onSubmit={handlePasswordSubmit}>
        <p className="dash-card-label">Change password</p>
        <PasswordInput
          label="Current password"
          name="currentPassword"
          autoComplete="current-password"
        />
        <PasswordInput
          label="New password"
          name="newPassword"
          autoComplete="new-password"
          placeholder="At least 8 characters"
        />
        <PasswordInput
          label="Confirm new password"
          name="confirmPassword"
          autoComplete="new-password"
        />
        <NoticeMessage notice={passwordNotice} />
        <button
          className="auth-submit dash-submit"
          type="submit"
          disabled={isSavingPassword}
        >
          {isSavingPassword ? "Updating…" : "Update password"}
        </button>
      </form>

      <button className="dash-danger-link" type="button" onClick={handleSignOut}>
        Sign out of Aimify
      </button>
    </div>
  );
}

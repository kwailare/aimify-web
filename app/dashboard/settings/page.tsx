"use client";

import { signOut } from "next-auth/react";
import { PasswordInput } from "@/components/password-input";
import { useDashboardContext } from "@/components/dashboard-context";

const roles = [
  "Owner",
  "Administrator",
  "Warehouse Manager",
  "Sales Staff",
  "Inventory Staff",
  "Accountant / Finance",
];

export default function DashboardSettingsPage() {
  const { user, role } = useDashboardContext();

  const handleSignOut = async () => {
    await signOut({ redirectTo: "/signin" });
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

      <form className="dash-card dash-form">
        <p className="dash-card-label">Profile</p>
        <div className="auth-field-row">
          <div className="auth-field">
            <label className="auth-label" htmlFor="settings-name">
              Full name
            </label>
            <input
              className="auth-input"
              id="settings-name"
              type="text"
              defaultValue={user.name}
            />
          </div>
          <div className="auth-field">
            <label className="auth-label" htmlFor="settings-role">
              Role
            </label>
            <select className="auth-input" id="settings-role" defaultValue={role || roles[0]}>
              {roles.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        </div>
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
        <button className="auth-submit dash-submit" type="button">
          Save profile
        </button>
      </form>

      <form className="dash-card dash-form">
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
        <button className="auth-submit dash-submit" type="button">
          Update password
        </button>
      </form>

      <button className="dash-danger-link" type="button" onClick={handleSignOut}>
        Sign out of Aimify
      </button>
    </div>
  );
}

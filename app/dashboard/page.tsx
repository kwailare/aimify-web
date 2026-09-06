"use client";

import Link from "next/link";
import { ArrowUpRight, Check } from "lucide-react";
import { useOnboardingState } from "@/components/onboarding-store";

export default function DashboardOverviewPage() {
  const state = useOnboardingState();
  const firstName = state.fullName.split(" ")[0] || "there";

  return (
    <div className="dash-stack">
      <div>
        <p className="dash-page-eyebrow">Overview</p>
        <h1 className="dash-page-title">Welcome back, {firstName}</h1>
        <p className="dash-page-subtitle">
          Here&apos;s the current state of {state.companyName || "your organization"}
          &apos;s Aimify account.
        </p>
      </div>

      <div className="dash-promo">
        <div>
          <p className="dash-promo-title">Your desktop app is ready</p>
          <p className="dash-promo-copy">
            Inventory, sales, purchases and credit all live in the Aimify
            desktop app. Download it to start managing stock.
          </p>
        </div>
        <Link className="hero-primary" href="/dashboard/download">
          Go to download
          <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </div>

      <div className="dash-grid">
        <div className="dash-card">
          <p className="dash-card-label">Organization</p>
          <p className="dash-card-value">{state.companyName || "—"}</p>
          <p className="dash-card-note">Single warehouse · Naira (NGN)</p>
        </div>
        <div className="dash-card">
          <p className="dash-card-label">Subscription</p>
          <p className="dash-card-value">Full Access</p>
          <p className="dash-card-note">14-day trial · ₦25,000 / month after</p>
        </div>
        <div className="dash-card">
          <p className="dash-card-label">Your role</p>
          <p className="dash-card-value">{state.role || "—"}</p>
          <p className="dash-card-note">Manage roles in Settings</p>
        </div>
      </div>

      <div className="dash-card">
        <p className="dash-card-label">Setup status</p>
        <ul className="dash-status-list">
          <li className="is-done">
            <Check size={14} aria-hidden="true" /> Profile created
          </li>
          <li className="is-done">
            <Check size={14} aria-hidden="true" /> Organization created
          </li>
          <li className="is-done">
            <Check size={14} aria-hidden="true" /> Subscription active
          </li>
        </ul>
      </div>
    </div>
  );
}

"use client";

import { DownloadCard } from "@/components/download-card";

export default function DashboardDownloadPage() {
  return (
    <div className="dash-stack">
      <div>
        <p className="dash-page-eyebrow">Download</p>
        <h1 className="dash-page-title">Aimify Desktop</h1>
        <p className="dash-page-subtitle">
          Inventory, purchases, sales and credit management live in the
          desktop app. Reinstall or update anytime from here.
        </p>
      </div>

      <div className="dash-card">
        <DownloadCard compact />
      </div>
    </div>
  );
}

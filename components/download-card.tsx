import { OsDownloadButtons } from "@/components/os-download-buttons";

export function DownloadCard({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "download-card is-compact" : "download-card"}>
      <div className="download-card-head">
        <div>
          <p className="download-card-title">Aimify Desktop</p>
          <p className="download-card-version">Version 1.4.2 — released Aug 2026</p>
        </div>
        <span className="download-card-badge">Included in your plan</span>
      </div>
      <OsDownloadButtons />
      <p className="download-card-note">
        Your license activates automatically when you sign in with your
        Aimify account on first launch. Need help installing?{" "}
        <a href="mailto:hello@aimify.com">Contact support</a>.
      </p>
    </div>
  );
}

import { OsDownloadButtons } from "@/components/os-download-buttons";
import { formatDate } from "@/lib/format-date";

export function DownloadCard({ compact = false }: { compact?: boolean }) {
  const version = process.env.NEXT_PUBLIC_DESKTOP_VERSION;
  const released = process.env.NEXT_PUBLIC_DESKTOP_RELEASED;
  const versionLabel = version
    ? `Version ${version}${released ? ` — released ${formatDate(released)}` : ""}`
    : "Not released yet";

  return (
    <div className={compact ? "download-card is-compact" : "download-card"}>
      <div className="download-card-head">
        <div>
          <p className="download-card-title">Aimify Desktop</p>
          <p className="download-card-version" suppressHydrationWarning>{versionLabel}</p>
        </div>
        <span className="download-card-badge">Included in your plan</span>
      </div>
      <OsDownloadButtons />
      <p className="download-card-note">
        Your license activates automatically when you sign in with your
        Aimify account on first launch. Need help installing?{" "}
        <a href="mailto:support@aimify.app">Contact support</a>.
      </p>
    </div>
  );
}

"use client";

import { Download } from "lucide-react";
import { useSyncExternalStore } from "react";

const platforms = [
  { id: "windows", label: "Windows", detail: "Windows 10 or later (64-bit)" },
  { id: "mac", label: "macOS", detail: "macOS 12 Monterey or later" },
  { id: "linux", label: "Linux", detail: "Ubuntu 20.04+ / Debian-based" },
];

function noopSubscribe() {
  return () => {};
}

function getPlatformSnapshot(): string | null {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "windows";
  if (ua.includes("mac")) return "mac";
  if (ua.includes("linux") || ua.includes("x11")) return "linux";
  return null;
}

function getServerPlatformSnapshot(): string | null {
  return null;
}

export function OsDownloadButtons() {
  const detected = useSyncExternalStore(
    noopSubscribe,
    getPlatformSnapshot,
    getServerPlatformSnapshot,
  );

  return (
    <div className="download-grid">
      {platforms.map((platform) => (
        <a
          key={platform.id}
          className={
            detected === platform.id
              ? "download-option is-recommended"
              : "download-option"
          }
          href="#"
        >
          <Download size={18} aria-hidden="true" />
          <span className="download-option-text">
            <strong>{platform.label}</strong>
            <small>{platform.detail}</small>
          </span>
          {detected === platform.id && (
            <span className="download-badge">Recommended</span>
          )}
        </a>
      ))}
    </div>
  );
}

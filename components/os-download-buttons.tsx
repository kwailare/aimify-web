"use client";

import { Download } from "lucide-react";
import { useSyncExternalStore } from "react";

const platforms = [
  {
    id: "windows",
    label: "Windows",
    detail: "Windows 10 or later (64-bit)",
    comingSoon: false,
  },
  {
    id: "mac",
    label: "macOS",
    detail: "macOS 12 Monterey or later",
    comingSoon: true,
  },
  {
    id: "linux",
    label: "Linux",
    detail: "Ubuntu 20.04+ / Debian-based",
    comingSoon: true,
  },
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
      {platforms.map((platform) => {
        const isRecommended = !platform.comingSoon && detected === platform.id;
        const classNames = ["download-option"];
        if (isRecommended) classNames.push("is-recommended");
        if (platform.comingSoon) classNames.push("is-coming-soon");

        if (platform.comingSoon) {
          return (
            <span
              key={platform.id}
              className={classNames.join(" ")}
              aria-disabled="true"
            >
              <Download size={18} aria-hidden="true" />
              <span className="download-option-text">
                <strong>{platform.label}</strong>
                <small>{platform.detail}</small>
              </span>
              <span className="download-badge download-badge-soon">
                Coming soon
              </span>
            </span>
          );
        }

        return (
          <a key={platform.id} className={classNames.join(" ")} href="#">
            <Download size={18} aria-hidden="true" />
            <span className="download-option-text">
              <strong>{platform.label}</strong>
              <small>{platform.detail}</small>
            </span>
            {isRecommended && (
              <span className="download-badge">Recommended</span>
            )}
          </a>
        );
      })}
    </div>
  );
}

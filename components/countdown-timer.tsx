"use client";

import { useEffect, useState } from "react";

type TimeLeft = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

function getTimeLeft(targetMs: number): TimeLeft | null {
  const diff = targetMs - Date.now();

  if (diff <= 0) {
    return null;
  }

  return {
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor((diff / 3_600_000) % 24),
    minutes: Math.floor((diff / 60_000) % 60),
    seconds: Math.floor((diff / 1_000) % 60),
  };
}

export function CountdownTimer({ targetIso }: { targetIso: string }) {
  const targetMs = new Date(targetIso).getTime();

  // Stays null through the server render and the first client render so
  // they match exactly -- "now" differs between when the server renders
  // this page and when the browser hydrates it, so computing real numbers
  // at either of those two moments (instead of only after mount, via this
  // effect) would produce a hydration mismatch.
  const [timeLeft, setTimeLeft] = useState<TimeLeft | "launched" | null>(null);

  useEffect(() => {
    function tick() {
      setTimeLeft(getTimeLeft(targetMs) ?? "launched");
    }

    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [targetMs]);

  if (timeLeft === "launched") {
    return (
      <p className="countdown-launched">We&apos;re live — refresh the page.</p>
    );
  }

  const display = timeLeft ?? { days: 0, hours: 0, minutes: 0, seconds: 0 };

  return (
    <div className="countdown-grid" aria-live="polite" aria-atomic="true">
      <CountdownUnit value={display.days} label="Days" />
      <CountdownUnit value={display.hours} label="Hours" />
      <CountdownUnit value={display.minutes} label="Minutes" />
      <CountdownUnit value={display.seconds} label="Seconds" />
    </div>
  );
}

function CountdownUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="countdown-unit">
      <span className="countdown-value">{String(value).padStart(2, "0")}</span>
      <span className="countdown-label">{label}</span>
    </div>
  );
}

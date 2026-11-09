"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { setActiveProviderAction } from "@/lib/actions/admin-payments";

export type ProviderStatus = {
  id: string;
  name: string;
  configured: boolean;
  mode: "live" | "test" | null;
  active: boolean;
  savedCards: number;
};

/**
 * The payment providers Aimify can use: whether each has its keys (and
 * whether they're live or test keys), which one new payments go through,
 * and how many saved cards each one still renews.
 */
export function AdminPaymentProviders({ providers }: { providers: ProviderStatus[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const choose = async (id: string) => {
    setError(null);
    setBusy(id);
    const result = await setActiveProviderAction(id);
    setBusy(null);
    if (result?.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  };

  return (
    <div className="dash-stack">
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      <div className="dash-table-wrap">
        <table className="dash-table">
          <thead>
            <tr>
              <th>Provider</th>
              <th>Keys</th>
              <th>Saved cards</th>
              <th>New payments</th>
            </tr>
          </thead>
          <tbody>
            {providers.map((p) => (
              <tr key={p.id} data-provider={p.id}>
                <td>{p.name}</td>
                <td>
                  <span className={`dash-badge ${p.configured ? "is-active" : "is-upcoming"}`}>
                    {!p.configured ? "Not set" : p.mode === "live" ? "Live" : "Test mode"}
                  </span>
                </td>
                <td>{p.savedCards.toLocaleString("en-US")}</td>
                <td>
                  {p.active ? (
                    <span className="dash-badge is-active">In use</span>
                  ) : (
                    <button
                      className="dash-table-action"
                      type="button"
                      disabled={busy !== null || !p.configured}
                      onClick={() => choose(p.id)}
                    >
                      {busy === p.id ? "Working…" : "Use for new payments"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

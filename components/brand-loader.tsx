export function BrandLoader() {
  return (
    <div className="loader-scene scene relative isolate flex min-h-screen items-center justify-center overflow-hidden">
      <div className="loader-stack">
        <div className="loader-mark" aria-hidden="true">
          <span className="brand-primary">Aimi</span>
          <span className="brand-accent">fy</span>
        </div>
        <div className="loader-bar" aria-hidden="true">
          <span className="loader-bar-fill" />
        </div>
        <p className="loader-status" role="status" aria-live="polite">
          Loading…
        </p>
      </div>
    </div>
  );
}

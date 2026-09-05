import {
  ClipboardPlus,
  PackageCheck,
  ScanSearch,
  type LucideIcon,
} from "lucide-react";

const steps: Array<{
  number: string;
  icon: LucideIcon;
  title: string;
  description: string;
}> = [
  {
    number: "01",
    icon: ClipboardPlus,
    title: "Set up your business",
    description:
      "Add your company profile, warehouse and team in a guided setup — no IT department required.",
  },
  {
    number: "02",
    icon: ScanSearch,
    title: "Add products & opening stock",
    description:
      "Bring in your catalog, set reorder points, and record your true opening stock.",
  },
  {
    number: "03",
    icon: PackageCheck,
    title: "Sell, purchase & track debt",
    description:
      "Every sale, purchase, payment and stock change is recorded automatically — fully auditable, always up to date.",
  },
];

export function HowItWorks() {
  return (
    <section id="method" className="works-panel w-full p-7 sm:p-12 lg:p-16">
      <div className="mb-10 max-w-2xl">
        <p className="body-kicker text-xs font-bold uppercase tracking-[0.28em]">
          How it works
        </p>
        <h2 className="features-title mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          From sign-up to full stock control.
        </h2>
        <p className="body-copy mt-4 max-w-xl text-base leading-7">
          A guided setup gets your business live fast, then every sale,
          purchase and stock change stays tracked automatically.
        </p>
      </div>
      <div className="works-grid">
        {steps.map((step, index) => {
          const Icon = step.icon;

          return (
            <article className="works-step" key={step.number}>
              <div className="works-step-top">
                <span className="works-step-number">{step.number}</span>
                <span className="works-icon" aria-hidden="true">
                  <Icon size={20} strokeWidth={1.8} />
                </span>
              </div>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
              {index < steps.length - 1 && (
                <span className="works-connector" aria-hidden="true" />
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

import {
  Boxes,
  CreditCard,
  MessageCircle,
  ShieldCheck,
  ShoppingCart,
  Truck,
  type LucideIcon,
} from "lucide-react";

const features: Array<{
  icon: LucideIcon;
  title: string;
  description: string;
}> = [
  {
    icon: Boxes,
    title: "Real-time inventory",
    description:
      "Track stock across every warehouse with a full, auditable history of every stock-in, stock-out and adjustment.",
  },
  {
    icon: ShoppingCart,
    title: "Purchases & sales",
    description:
      "Receiving a purchase or completing a sale updates your inventory automatically — no manual recounts.",
  },
  {
    icon: CreditCard,
    title: "Credit & debt tracking",
    description:
      "Set customer credit limits, record repayments and always know exactly who owes what.",
  },
  {
    icon: Truck,
    title: "Supplier management",
    description:
      "Keep supplier records, purchase history and outstanding balances organized in one place.",
  },
  {
    icon: MessageCircle,
    title: "WhatsApp-native alerts",
    description:
      "Low-stock alerts, invoices and repayment reminders sent where your business already talks.",
  },
  {
    icon: ShieldCheck,
    title: "Full audit trail",
    description:
      "Every change is tied to a user, a reason and a timestamp — stock is never silently overwritten.",
  },
];

export function Features() {
  return (
    <section
      id="features"
      className="features-panel w-full p-7 sm:p-12 lg:p-16"
    >
      <div className="mb-8 max-w-2xl">
        <p className="body-kicker text-xs font-bold uppercase tracking-[0.28em]">
          Built for how you trade
        </p>
        <h2 className="features-title mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          Everything your business runs on, in one place.
        </h2>
        <p className="body-copy mt-4 max-w-xl text-base leading-7">
          From stock and suppliers to customer credit, Aimify replaces
          disconnected tools with one accurate, auditable system.
        </p>
      </div>
      <div className="features-grid">
        {features.map((feature) => {
          const Icon = feature.icon;

          return (
            <article className="feature-card" key={feature.title}>
              <span className="feature-icon" aria-hidden="true">
                <Icon size={20} strokeWidth={1.8} />
              </span>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

import { ArrowUpRight, TriangleAlert } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

const metrics = [
  { value: "Full", label: "Audit trail on every change" },
  { value: "WhatsApp", label: "Native alerts & invoices" },
  { value: "1", label: "Secure tenant, just for you" },
];

const stockBars = [
  { label: "Beverages", value: 68 },
  { label: "Snacks", value: 82 },
  { label: "Dairy", value: 54 },
  { label: "Grains", value: 22, low: true },
  { label: "Household", value: 74 },
];

const chartStats = [
  { value: "1,248", label: "Items in stock" },
  { value: "3", label: "Low-stock alerts" },
  { value: "₦25.4M", label: "Inventory value" },
];

const CHART_BASE_Y = 104;
const CHART_MAX_H = 80;
const BAR_WIDTH = 28;
const BAR_GAP = 14;
const CHART_START_X = 42;
const REORDER_Y = CHART_BASE_Y - CHART_MAX_H * 0.3;

export function Hero() {
  return (
    <section
      id="focus"
      className="body-panel hero-panel w-full space-y-8 p-7 sm:p-12 lg:p-16"
    >
      <div className="hero-grid">
        <div className="max-w-3xl">
          <p className="body-kicker mb-5 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.28em]">
            <Image
              className="hero-logo"
              src="/assets/image/logo.png"
              alt=""
              width={58}
              height={58}
            />
            Multi-tenant inventory & warehouse management
          </p>
          <h1 className="body-title max-w-2xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
            Stop guessing your stock. Start trusting it.
          </h1>
          <p className="body-copy mt-6 max-w-xl text-base leading-7 sm:text-lg">
            Aimify replaces the notebooks and spreadsheets slowing your
            business down with one secure platform for inventory, purchases,
            sales, credit and suppliers — where every stock change is
            tracked, never silently overwritten.
          </p>
          <div className="hero-actions mt-8 flex flex-col gap-3 sm:flex-row">
            <Link className="hero-primary" href="/signup">
              Get started
              <ArrowUpRight size={17} aria-hidden="true" />
            </Link>
            <a className="hero-secondary" href="#method">
              See how it works
            </a>
          </div>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="hero-chart-card">
            <div className="hero-chart-head">
              <div>
                <p className="hero-chart-title">Inventory overview</p>
                <p className="hero-chart-sub">Across 3 warehouses</p>
              </div>
              <span className="hero-chart-live">
                <span className="hero-chart-live-dot" />
                Live
              </span>
            </div>
            <svg
              className="hero-chart-svg"
              viewBox="0 0 280 130"
              role="img"
              aria-label="Example stock levels by category"
            >
              <line
                className="hero-chart-baseline"
                x1="18"
                y1={CHART_BASE_Y}
                x2="262"
                y2={CHART_BASE_Y}
              />
              <line
                className="hero-chart-threshold"
                x1="18"
                y1={REORDER_Y}
                x2="262"
                y2={REORDER_Y}
              />
              <text x="18" y={REORDER_Y - 5} className="hero-chart-threshold-label">
                Reorder point
              </text>
              {stockBars.map((bar, index) => {
                const height = (bar.value / 100) * CHART_MAX_H;
                const x = CHART_START_X + index * (BAR_WIDTH + BAR_GAP);
                const y = CHART_BASE_Y - height;

                return (
                  <g key={bar.label}>
                    <rect
                      className={
                        bar.low ? "hero-chart-bar is-low" : "hero-chart-bar"
                      }
                      x={x}
                      y={y}
                      width={BAR_WIDTH}
                      height={height}
                      rx="4"
                    />
                    <text
                      x={x + BAR_WIDTH / 2}
                      y={CHART_BASE_Y + 16}
                      className="hero-chart-label"
                    >
                      {bar.label}
                    </text>
                  </g>
                );
              })}
            </svg>
            <div className="hero-chart-flag">
              <TriangleAlert size={13} aria-hidden="true" />
              Grains is below its reorder point
            </div>
            <div className="hero-chart-stats">
              {chartStats.map((stat) => (
                <div key={stat.label}>
                  <strong>{stat.value}</strong>
                  <span>{stat.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="hero-metrics" aria-label="Aimify principles">
        {metrics.map((metric) => (
          <div className="hero-metric" key={metric.label}>
            <strong>{metric.value}</strong>
            <span>{metric.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

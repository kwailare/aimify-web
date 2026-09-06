"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Building2,
  CreditCard,
  Download,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Settings,
  Sun,
  X,
} from "lucide-react";
import { signOut } from "next-auth/react";
import {
  nextIncompleteStep,
  resetOnboarding,
  useOnboardingState,
} from "@/components/onboarding-store";
import { toggleTheme, useIsDarkMode } from "@/components/theme-store";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/organization", label: "Organization", icon: Building2 },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
  { href: "/dashboard/download", label: "Download", icon: Download },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function DashboardShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isDark = useIsDarkMode();
  const state = useOnboardingState();
  const redirectTo = nextIncompleteStep(state);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    if (redirectTo) {
      router.replace(redirectTo);
    }
  }, [redirectTo, router]);

  const closeMenu = () => setIsMenuOpen(false);

  const handleSignOut = async () => {
    resetOnboarding();
    await signOut({ redirectTo: "/signin" });
  };

  if (redirectTo) {
    return null;
  }

  const activeLabel =
    navItems.find(
      (item) =>
        item.href === pathname ||
        (item.href !== "/dashboard" && pathname.startsWith(item.href)),
    )?.label ?? "Overview";

  return (
    <div className="dash-shell">
      <aside className={`dash-sidebar ${isMenuOpen ? "is-open" : ""}`}>
        <Link className="nav-brand dash-brand inline-flex items-baseline" href="/dashboard">
          <span className="brand-primary">Aimi</span>
          <span className="brand-accent">fy</span>
        </Link>
        <nav className="dash-nav" aria-label="Dashboard navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === pathname ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`dash-nav-link ${isActive ? "is-active" : ""}`}
                onClick={closeMenu}
              >
                <Icon size={17} aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="dash-sidebar-footer">
          <p className="dash-org-name">{state.companyName || "Your organization"}</p>
          <p className="dash-org-plan">Full Access · Trial</p>
          <button className="dash-signout" type="button" onClick={handleSignOut}>
            <LogOut size={15} aria-hidden="true" />
            Sign out
          </button>
        </div>
      </aside>
      {isMenuOpen && (
        <button
          className="dash-scrim"
          type="button"
          aria-label="Close menu"
          onClick={() => setIsMenuOpen(false)}
        />
      )}
      <div className="dash-main">
        <header className="dash-topbar">
          <button
            className="dash-menu-button"
            type="button"
            aria-label={isMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={isMenuOpen}
            onClick={() => setIsMenuOpen((open) => !open)}
          >
            {isMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          <p className="dash-topbar-title">{activeLabel}</p>
          <Button
            variant="outline"
            size="icon"
            className="theme-toggle"
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            onClick={toggleTheme}
          >
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </Button>
        </header>
        <div className="dash-content">{children}</div>
      </div>
    </div>
  );
}

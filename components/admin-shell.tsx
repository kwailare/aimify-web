"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Building2,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Sun,
  Users,
  X,
} from "lucide-react";
import { signOut } from "next-auth/react";
import type { users } from "@/db/schema";
import { toggleTheme, useIsDarkMode } from "@/components/theme-store";

const navItems = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/organizations", label: "Organizations", icon: Building2 },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/activity", label: "Activity", icon: History },
];

export function AdminShell({
  admin,
  children,
}: {
  admin: typeof users.$inferSelect;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const isDark = useIsDarkMode();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const closeMenu = () => setIsMenuOpen(false);

  const handleSignOut = async () => {
    await signOut({ redirectTo: "/signin" });
  };

  const activeLabel =
    navItems.find(
      (item) =>
        item.href === pathname ||
        (item.href !== "/admin" && pathname.startsWith(item.href)),
    )?.label ?? "Overview";

  return (
    <div className="dash-shell">
      <aside className={`dash-sidebar admin-sidebar ${isMenuOpen ? "is-open" : ""}`}>
        <div className="dash-brand admin-brand">
          <Link className="nav-brand inline-flex items-baseline" href="/admin">
            <span className="brand-primary">Aimi</span>
            <span className="brand-accent">fy</span>
          </Link>
          <span className="admin-badge">Admin</span>
        </div>
        <nav className="dash-nav" aria-label="Admin navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === pathname ||
              (item.href !== "/admin" && pathname.startsWith(item.href));

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
          <p className="dash-org-name">{admin.name}</p>
          <p className="dash-org-plan">{admin.email}</p>
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

"use client";

import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, Menu, Moon, Sun, X } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";
import { useEffect, useState, useSyncExternalStore } from "react";

const links = [
  { label: "Overview", href: "#focus" },
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#method" },
  { label: "Pricing", href: "#pricing" },
];

const themeListeners = new Set<() => void>();

function subscribeToTheme(listener: () => void) {
  themeListeners.add(listener);
  return () => themeListeners.delete(listener);
}

function getThemeSnapshot() {
  return document.documentElement.classList.contains("dark");
}

function getServerThemeSnapshot() {
  return false;
}

function notifyThemeChange() {
  themeListeners.forEach((listener) => listener());
}

export function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const isDark = useSyncExternalStore(
    subscribeToTheme,
    getThemeSnapshot,
    getServerThemeSnapshot,
  );

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("aimify-theme");
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    const shouldUseDark = savedTheme === "dark" || (!savedTheme && prefersDark);

    document.documentElement.classList.toggle("dark", shouldUseDark);
    notifyThemeChange();
  }, []);

  const closeMenu = () => setIsMenuOpen(false);

  const toggleTheme = () => {
    const nextIsDark = !isDark;

    document.documentElement.classList.toggle("dark", nextIsDark);
    window.localStorage.setItem("aimify-theme", nextIsDark ? "dark" : "light");
    notifyThemeChange();
  };

  return (
    <header className="nav-panel w-full px-4 py-3 sm:px-6 lg:px-10">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6">
        <a
          className="nav-brand inline-flex items-baseline"
          href="#top"
          onClick={closeMenu}
        >
          <span className="brand-primary">Aimi</span>
          <span className="brand-accent">fy</span>
        </a>
        <div className="hidden items-center gap-7 lg:flex">
          <NavigationMenu>
            <NavigationMenuList className="gap-1">
              {links.map((link) => (
                <NavigationMenuItem key={link.href}>
                  <NavigationMenuLink className="nav-link" href={link.href}>
                    {link.label}
                  </NavigationMenuLink>
                </NavigationMenuItem>
              ))}
            </NavigationMenuList>
          </NavigationMenu>
          <div className="nav-actions">
            <Button
              variant="outline"
              size="icon"
              className="theme-toggle"
              aria-label={
                isDark ? "Switch to light mode" : "Switch to dark mode"
              }
              onClick={toggleTheme}
            >
              {isDark ? <Sun /> : <Moon />}
            </Button>
            <Link className="nav-signin" href="/signin">
              Sign in
            </Link>
            <Link className="nav-cta" href="/signup">
              Get started
              <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          </div>
        </div>
        <Button
          variant="outline"
          size="icon"
          className="nav-menu-button lg:hidden"
          aria-label={
            isMenuOpen ? "Close navigation menu" : "Open navigation menu"
          }
          aria-expanded={isMenuOpen}
          onClick={() => setIsMenuOpen((open) => !open)}
        >
          {isMenuOpen ? <X /> : <Menu />}
        </Button>
      </div>
      <div
        className={`nav-mobile-menu lg:hidden ${isMenuOpen ? "is-open" : ""}`}
      >
        <nav aria-label="Mobile navigation" className="grid gap-1 pt-4">
          {links.map((link, index) => (
            <a
              key={link.href}
              href={link.href}
              className="nav-mobile-link"
              style={{ "--link-index": index } as CSSProperties}
              onClick={closeMenu}
            >
              {link.label}
            </a>
          ))}
          <Button
            variant="outline"
            className="theme-toggle theme-toggle--full mt-3"
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            onClick={toggleTheme}
          >
            {isDark ? <Sun /> : <Moon />}
            {isDark ? "Light mode" : "Dark mode"}
          </Button>
          <Link
            className="nav-signin mt-3 justify-center"
            href="/signin"
            onClick={closeMenu}
          >
            Sign in
          </Link>
          <Link
            className="nav-cta mt-2 justify-center text-center"
            href="/signup"
            onClick={closeMenu}
          >
            Get started
            <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </nav>
      </div>
    </header>
  );
}

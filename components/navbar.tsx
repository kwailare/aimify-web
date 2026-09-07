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
import { usePathname } from "next/navigation";
import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { toggleTheme, useIsDarkMode } from "@/components/theme-store";

const links = [
  { label: "Overview", href: "/#focus" },
  { label: "Features", href: "/#features" },
  { label: "How it works", href: "/#method" },
  { label: "Pricing", href: "/#pricing" },
];

export function Navbar() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeHref, setActiveHref] = useState<string | null>(
    isHome ? links[0].href : null,
  );
  const isDark = useIsDarkMode();

  const closeMenu = () => setIsMenuOpen(false);

  useEffect(() => {
    if (!isHome) {
      return;
    }

    const sections = links
      .map((link) => document.getElementById(link.href.split("#")[1]))
      .filter((section): section is HTMLElement => section !== null);

    if (sections.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

        if (visible[0]) {
          setActiveHref(`/#${visible[0].target.id}`);
        }
      },
      { rootMargin: "-80px 0px -55% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] },
    );

    sections.forEach((section) => observer.observe(section));

    return () => observer.disconnect();
  }, [isHome]);

  return (
    <header className="nav-panel w-full px-4 py-3 sm:px-6 lg:px-10">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6">
        <Link
          className="nav-brand inline-flex items-baseline"
          href="/#top"
          onClick={closeMenu}
        >
          <span className="brand-primary">Aimi</span>
          <span className="brand-accent">fy</span>
        </Link>
        <div className="hidden items-center gap-7 lg:flex">
          <NavigationMenu>
            <NavigationMenuList className="gap-1">
              {links.map((link) => (
                <NavigationMenuItem key={link.href}>
                  <NavigationMenuLink
                    className={`nav-link ${activeHref === link.href ? "is-active" : ""}`}
                    href={link.href}
                    onClick={() => setActiveHref(link.href)}
                  >
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
            <Link
              key={link.href}
              href={link.href}
              className={`nav-mobile-link ${activeHref === link.href ? "is-active" : ""}`}
              style={{ "--link-index": index } as CSSProperties}
              onClick={() => {
                setActiveHref(link.href);
                closeMenu();
              }}
            >
              {link.label}
            </Link>
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

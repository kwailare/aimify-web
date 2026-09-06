"use client";

import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return document.documentElement.classList.contains("dark");
}

function getServerSnapshot() {
  return false;
}

export function useIsDarkMode() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function toggleTheme() {
  const nextIsDark = !document.documentElement.classList.contains("dark");
  document.documentElement.classList.toggle("dark", nextIsDark);
  window.localStorage.setItem("aimify-theme", nextIsDark ? "dark" : "light");
  listeners.forEach((listener) => listener());
}

import { useSyncExternalStore } from "react";

export type OnboardingState = {
  profile: boolean;
  organization: boolean;
  subscription: boolean;
  fullName: string;
  companyName: string;
  role: string;
};

const STORAGE_KEY = "aimify-onboarding";

const emptyState: OnboardingState = {
  profile: false,
  organization: false,
  subscription: false,
  fullName: "",
  companyName: "",
  role: "",
};

function readState(): OnboardingState {
  if (typeof window === "undefined") {
    return emptyState;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? { ...emptyState, ...JSON.parse(raw) } : emptyState;
  } catch {
    return emptyState;
  }
}

let cachedState = readState();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function persist(next: OnboardingState) {
  cachedState = next;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  notify();
}

export function subscribeOnboarding(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getOnboardingSnapshot() {
  return cachedState;
}

export function getOnboardingServerSnapshot() {
  return emptyState;
}

export function completeProfile(fullName: string, role: string) {
  persist({ ...cachedState, profile: true, fullName, role });
}

export function completeOrganization(companyName: string) {
  persist({ ...cachedState, organization: true, companyName });
}

export function completeSubscription() {
  persist({ ...cachedState, subscription: true });
}

export function resetOnboarding() {
  cachedState = emptyState;
  window.localStorage.removeItem(STORAGE_KEY);
  notify();
}

export function isOnboardingComplete(state: OnboardingState) {
  return state.profile && state.organization && state.subscription;
}

export function nextIncompleteStep(state: OnboardingState) {
  if (!state.profile) return "/onboarding/profile";
  if (!state.organization) return "/onboarding/organization";
  if (!state.subscription) return "/onboarding/subscription";
  return null;
}

export function useOnboardingState() {
  return useSyncExternalStore(
    subscribeOnboarding,
    getOnboardingSnapshot,
    getOnboardingServerSnapshot,
  );
}

import type { ReactNode } from "react";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";

export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <>
      <Navbar />
      <main className="scene relative isolate flex min-h-screen flex-col items-center justify-between overflow-hidden pt-[4.5rem]">
        <div className="relative z-10 mx-auto flex min-h-full w-full max-w-7xl flex-col items-center justify-between px-4 sm:px-6 lg:px-8">
          {children}
          <Footer />
        </div>
      </main>
    </>
  );
}

import { Features } from "@/components/features";
import { Footer } from "@/components/footer";
import { Hero } from "@/components/hero";
import { HowItWorks } from "@/components/how-it-works";
import { Navbar } from "@/components/navbar";
import { Pricing } from "@/components/pricing";

export default function Home() {
  return (
    <>
      <Navbar />
      <main
        id="top"
        className="scene relative isolate flex min-h-screen flex-col items-center justify-between overflow-hidden pt-[4.5rem]"
      >
        <div className="relative z-10 mx-auto flex min-h-full w-full max-w-7xl flex-col items-center justify-between px-4 sm:px-6 lg:px-8">
          <Hero />
          <Features />
          <HowItWorks />
          <Pricing />
          <Footer />
        </div>
      </main>
    </>
  );
}

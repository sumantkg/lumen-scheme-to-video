import Nav from "@/components/landing/Nav";
import Hero from "@/components/landing/Hero";
import Features from "@/components/landing/Features";
import Steps from "@/components/landing/Steps";
import Showcase from "@/components/landing/Showcase";
import Faq from "@/components/landing/Faq";
import CtaSection from "@/components/landing/CtaSection";
import SiteFooter from "@/components/site/SiteFooter";

export default function HomePage() {
  return (
    <>
      <Nav />
      <main id="top">
        <Hero />
        <Features />
        <Steps />
        <Showcase />
        <Faq />
        <CtaSection />
      </main>
      <SiteFooter />
    </>
  );
}

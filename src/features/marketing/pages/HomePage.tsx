// ──────────────────────────────────────────────────────────────────────────────
// HOME
//
// Composition only. Every section is a component in ../components/sections.tsx
// with its content in a const at the top of that file, so this page reads as
// the narrative order and nothing else:
//
//   hook → proof of breadth → the pain → the answer → the depth → the trust →
//   the price → the origin → the objections → the ask
//
// SEO, JSON-LD and analytics are unchanged from the previous version — the
// brief was explicit that none of that may regress, and the FAQ array is now
// imported from the sections module so the visible copy and the FAQPage
// structured data can never drift apart.
// ──────────────────────────────────────────────────────────────────────────────

import React, { useEffect } from "react";
import { useSeo } from "../seo/useSeo";
import { ROUTE_SEO, organizationJsonLd, softwareJsonLd, faqJsonLd } from "../seo/seo";
import { marketingService } from "../services/marketing.service";
import { Hero } from "../components/Hero";
import { CtaBand } from "../components/ui";
import {
  TrustBar, StatsBand, WhySection, ModulesSection, AiSection, CommsSection,
  PortalsSection, EnterpriseSection, IntegrationsSection, PricingPreview,
  ProofSection, FaqSection, FAQS,
} from "../components/sections";

const HomePage: React.FC = () => {
  useSeo(ROUTE_SEO["/"], [organizationJsonLd(), softwareJsonLd(2999), faqJsonLd(FAQS)]);

  useEffect(() => {
    void marketingService.trackEvent("page_view", "/");
  }, []);

  return (
    <>
      <Hero onCtaClick={(to) => void marketingService.trackEvent("cta_click", to)} />
      <TrustBar />
      <StatsBand />
      <WhySection />
      <ModulesSection />
      <AiSection />
      <CommsSection />
      <PortalsSection />
      <EnterpriseSection />
      <IntegrationsSection />
      <PricingPreview />
      <ProofSection />
      <FaqSection />
      <CtaBand />
    </>
  );
};

export default HomePage;

// ──────────────────────────────────────────────────────────────────────────────
// MARKETING ROUTE REGISTRY
//
// Public, unauthenticated routes. A separate tree from both the ERP
// (sharedRoutes) and the control plane (platform/routes), because a marketing
// page must never accidentally inherit an authenticated layout — and because
// keeping them apart is what lets the prerenderer enumerate exactly the routes
// that should exist as static HTML.
//
// Every page is lazy-loaded: an authenticated ERP user never downloads the
// marketing bundle, and a visitor never downloads the ERP.
// ──────────────────────────────────────────────────────────────────────────────

import { Route } from "react-router-dom";
import { lazyWithRetry as lazy } from "@/lib/lazyWithRetry";
import { MarketingLayout } from "./components/MarketingShell";

const HomePage = lazy(() => import("./pages/HomePage"));
const PricingPage = lazy(() => import("./pages/PricingPage"));
const SignupPage = lazy(() => import("./pages/SignupPage"));

const Product = {
  Features: lazy(() => import("./pages/ProductPages").then((m) => ({ default: m.FeaturesPage }))),
  Modules: lazy(() => import("./pages/ProductPages").then((m) => ({ default: m.ModulesPage }))),
  Solutions: lazy(() => import("./pages/ProductPages").then((m) => ({ default: m.SolutionsPage }))),
  Compare: lazy(() => import("./pages/ProductPages").then((m) => ({ default: m.ComparePage }))),
  Security: lazy(() => import("./pages/ProductPages").then((m) => ({ default: m.SecurityPage }))),
  Marketplace: lazy(() => import("./pages/ProductPages").then((m) => ({ default: m.MarketplacePage }))),
  Developers: lazy(() => import("./pages/ProductPages").then((m) => ({ default: m.DevelopersPage }))),
};

const Content = {
  Demo: lazy(() => import("./pages/ContentPages").then((m) => ({ default: m.DemoPage }))),
  Contact: lazy(() => import("./pages/ContentPages").then((m) => ({ default: m.ContactPage }))),
  Status: lazy(() => import("./pages/ContentPages").then((m) => ({ default: m.StatusPage }))),
  Customers: lazy(() => import("./pages/ContentPages").then((m) => ({ default: m.CustomersPage }))),
  About: lazy(() => import("./pages/ContentPages").then((m) => ({ default: m.AboutPage }))),
  Careers: lazy(() => import("./pages/ContentPages").then((m) => ({ default: m.CareersPage }))),
  Partners: lazy(() => import("./pages/ContentPages").then((m) => ({ default: m.PartnersPage }))),
  Resources: lazy(() => import("./pages/ContentPages").then((m) => ({ default: m.ResourcesPage }))),
};

const listPage = (kind: "blog" | "help" | "docs") =>
  lazy(() =>
    import("./pages/ContentPages").then((m) => {
      const C = m.ContentListPage;
      return { default: () => <C kind={kind} /> };
    }),
  );

const detailPage = (kind: "blog" | "help" | "docs") =>
  lazy(() =>
    import("./pages/ContentPages").then((m) => {
      const C = m.ContentDetailPage;
      return { default: () => <C kind={kind} /> };
    }),
  );

const legalPage = (doc: "privacy" | "terms" | "cookies") =>
  lazy(() =>
    import("./pages/ContentPages").then((m) => {
      const C = m.LegalPage;
      return { default: () => <C doc={doc} /> };
    }),
  );

/**
 * Static marketing paths, in sitemap order.
 *
 * Exported so scripts/prerender-marketing.mjs and the sitemap generator read
 * the SAME list the router mounts. Three separate lists would drift, and the
 * drift is invisible — a page live in the app but absent from the sitemap
 * simply never gets crawled, and nobody notices for months.
 */
export const MARKETING_PATHS = [
  "/", "/features", "/solutions", "/modules", "/pricing", "/compare", "/demo",
  "/customers", "/security", "/status", "/about", "/contact", "/careers",
  "/partners", "/resources", "/blog", "/help", "/docs", "/marketplace",
  "/developers", "/privacy", "/terms", "/cookies",
] as const;

export const renderMarketingRoutes = () => (
  <Route element={<MarketingLayout />}>
    {/* "/" is mounted by App.tsx through RootRoute, which shows this page to
        signed-out visitors and defers to AuthRedirect for everyone else. It is
        NOT declared here, or a signed-in customer would land on the marketing
        page instead of their dashboard. */}
    <Route path="/features" element={<Product.Features />} />
    <Route path="/solutions" element={<Product.Solutions />} />
    <Route path="/modules" element={<Product.Modules />} />
    <Route path="/pricing" element={<PricingPage />} />
    <Route path="/compare" element={<Product.Compare />} />
    <Route path="/security" element={<Product.Security />} />
    <Route path="/marketplace" element={<Product.Marketplace />} />
    <Route path="/developers" element={<Product.Developers />} />

    <Route path="/demo" element={<Content.Demo />} />
    <Route path="/contact" element={<Content.Contact />} />
    <Route path="/status" element={<Content.Status />} />
    <Route path="/customers" element={<Content.Customers />} />
    <Route path="/about" element={<Content.About />} />
    <Route path="/careers" element={<Content.Careers />} />
    <Route path="/partners" element={<Content.Partners />} />
    <Route path="/resources" element={<Content.Resources />} />

    {(["blog", "help", "docs"] as const).map((kind) => {
      const List = listPage(kind);
      const Detail = detailPage(kind);
      return [
        <Route key={kind} path={`/${kind}`} element={<List />} />,
        <Route key={`${kind}-detail`} path={`/${kind}/:slug`} element={<Detail />} />,
      ];
    })}

    {(["privacy", "terms", "cookies"] as const).map((doc) => {
      const Doc = legalPage(doc);
      return <Route key={doc} path={`/${doc}`} element={<Doc />} />;
    })}

    <Route path="/signup" element={<SignupPage />} />
  </Route>
);

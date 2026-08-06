import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Check, Minus, ArrowRight } from "lucide-react";
import { Section, SectionHeading, CtaBand } from "../components/MarketingShell";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useSeo } from "../seo/useSeo";
import { ROUTE_SEO, faqJsonLd } from "../seo/seo";
import { marketingService, type PublicPlan } from "../services/marketing.service";
import { MODULE_CATALOG } from "@/features/rbac/constants/catalog";
import { cn } from "@/lib/utils";

const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

const limit = (v: number | null) => (v == null ? "Unlimited" : v.toLocaleString("en-IN"));

const PRICING_FAQS = [
  { q: "Is there a setup fee?", a: "No. Provisioning is automatic and takes under two minutes. Data migration assistance is available separately if you are moving from another system." },
  { q: "What counts as a student?", a: "Actively enrolled students on your billing date. Alumni, dropped and archived students do not count toward your limit." },
  { q: "What happens if I exceed a limit?", a: "Nothing breaks. We contact you about moving to the next tier. We never delete data or lock you out for going over." },
  { q: "Are WhatsApp messages included?", a: "Each plan includes a monthly allowance. Beyond that, messages are billed at cost plus a small margin — we show you exactly what the provider charges." },
  { q: "Can I change plans later?", a: "Yes, in either direction. Downgrading never destroys data; records beyond the new limit become read-only rather than being removed." },
];

/** Fallback so the page still renders if the plans table is unreachable. */
const FALLBACK_ORDER = ["starter", "growth", "professional", "enterprise"];

const PricingPage: React.FC = () => {
  const [yearly, setYearly] = useState(true);
  useSeo(ROUTE_SEO["/pricing"], [faqJsonLd(PRICING_FAQS)]);

  const { data: plans, isLoading, isError } = useQuery({
    queryKey: ["marketing", "plans"],
    queryFn: () => marketingService.plans(),
    staleTime: 10 * 60_000,
  });

  // `trial` and `internal` are operational plans, not things a visitor buys.
  const visible = useMemo(
    () =>
      (plans ?? [])
        .filter((p) => !["trial", "internal"].includes(p.code))
        .sort((a, b) => a.tierOrder - b.tierOrder),
    [plans],
  );

  const priceFor = (p: PublicPlan) => {
    const interval = yearly ? "yearly" : "monthly";
    const match = p.prices.find((x) => x.interval === interval);
    if (!match) return null;
    return yearly ? Math.round(match.amount / 12) : match.amount;
  };

  return (
    <>
      <Section className="pt-14">
        <SectionHeading
          eyebrow="Pricing"
          title="Priced per institution, not per headache"
          description="Every plan includes unlimited parent and student logins. No setup fee, no card for the trial, and your data is yours to export whenever you like."
        />

        {/* Billing period switch.
            The knob used to be `absolute` with NO horizontal anchor, so it was
            laid out from its static position — the button's centre, since
            buttons centre their content — and translate-x-[22px] then threw it
            outside the track and over the "Annual" label. `left-0` gives it the
            edge to travel from, which is what the 2px/22px offsets assume.
            Also given a visible resting state: on a light page `bg-muted` alone
            read as decoration, so first-time visitors never realised annual
            pricing was one tap away. */}
        <div className="mt-8 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setYearly(false)}
            className={cn(
              "rounded text-sm transition-colors hover:text-foreground",
              !yearly ? "font-medium text-foreground" : "text-muted-foreground",
            )}
          >
            Monthly
          </button>

          {/* The shared Radix switch, not a hand-rolled one: it centres the
              thumb with flex and reserves the travel with border-2, so there is
              no absolute positioning to get wrong. The only override is a
              stronger unchecked background — the default `bg-input` is nearly
              invisible on this page's near-white section. */}
          <Switch
            checked={yearly}
            onCheckedChange={setYearly}
            aria-label="Toggle annual billing"
            className="data-[state=unchecked]:bg-muted-foreground/30"
          />

          <button
            type="button"
            onClick={() => setYearly(true)}
            className={cn(
              "rounded text-sm transition-colors hover:text-foreground",
              yearly ? "font-medium text-foreground" : "text-muted-foreground",
            )}
          >
            Annual
          </button>

          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            Save 20%
          </span>
        </div>

        {isError && (
          <p className="mt-8 text-center text-sm text-muted-foreground">
            Pricing is temporarily unavailable.{" "}
            <Link to="/contact" className="text-primary hover:underline">Contact us</Link> for a quote.
          </p>
        )}

        <div className="mt-10 grid gap-4 lg:grid-cols-4">
          {isLoading
            ? FALLBACK_ORDER.map((k) => (
                <div key={k} className="h-96 animate-pulse rounded-xl border border-border bg-muted/40" />
              ))
            : visible.map((p) => {
                const price = priceFor(p);
                const featured = p.code === "growth";
                return (
                  <div
                    key={p.id}
                    className={cn(
                      "relative flex flex-col rounded-xl border bg-card p-5",
                      featured ? "border-primary shadow-sm" : "border-border",
                    )}
                  >
                    {featured && (
                      <span className="absolute -top-2.5 left-5 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                        Most popular
                      </span>
                    )}
                    <h3 className="font-semibold">{p.name}</h3>
                    <p className="mt-1 min-h-[2.5rem] text-xs text-muted-foreground">{p.description}</p>

                    <div className="mt-4">
                      {price == null ? (
                        <span className="text-2xl font-semibold tracking-tight">Custom</span>
                      ) : (
                        <>
                          <span className="text-3xl font-semibold tracking-tight">{inr(price)}</span>
                          <span className="text-sm text-muted-foreground">/month</span>
                          {yearly && (
                            <p className="mt-1 text-[11px] text-muted-foreground">billed annually</p>
                          )}
                        </>
                      )}
                    </div>

                    <dl className="mt-5 space-y-2 text-sm">
                      {[
                        ["Students", limit(p.maxStudents)],
                        ["Staff", limit(p.maxStaff)],
                        ["Branches", limit(p.maxBranches)],
                        ["Storage", p.maxStorageMb == null ? "Unlimited" : `${Math.round(p.maxStorageMb / 1024)} GB`],
                        ["WhatsApp / mo", limit(p.whatsappCredits)],
                        ["Support", p.supportLevel === "sla" ? "SLA + CSM" : p.supportLevel],
                      ].map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-3">
                          <dt className="text-muted-foreground">{k}</dt>
                          <dd className="text-right font-medium">{v}</dd>
                        </div>
                      ))}
                    </dl>

                    <div className="mt-5 flex-1 space-y-1.5 border-t border-border pt-4">
                      {[
                        ["White-label", p.allowWhiteLabel],
                        ["Custom domain", p.allowCustomDomain],
                        ["Marketplace", p.allowMarketplace],
                      ].map(([label, on]) => (
                        <div key={String(label)} className="flex items-center gap-2 text-xs">
                          {on ? (
                            <Check className="h-3.5 w-3.5 text-primary" aria-hidden />
                          ) : (
                            <Minus className="h-3.5 w-3.5 text-muted-foreground/50" aria-hidden />
                          )}
                          <span className={on ? "" : "text-muted-foreground/60"}>{String(label)}</span>
                          <span className="sr-only">{on ? "included" : "not included"}</span>
                        </div>
                      ))}
                    </div>

                    <Button
                      asChild
                      className="mt-5 w-full"
                      variant={featured ? "default" : "outline"}
                    >
                      {p.code === "enterprise" ? (
                        <Link to="/demo">Talk to sales</Link>
                      ) : (
                        <Link to={`/signup?plan=${p.code}`}>Start free trial</Link>
                      )}
                    </Button>
                  </div>
                );
              })}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Prices in INR, exclusive of GST. Need a different currency or a negotiated
          plan? <Link to="/contact" className="text-primary hover:underline">Talk to us</Link>.
        </p>
      </Section>

      {/* ── Module availability by plan ─────────────────────────────────── */}
      <Section muted>
        <SectionHeading
          title="What's included, module by module"
          description="Drawn from the live plan catalogue — this table is generated, never hand-maintained, so it cannot drift from what you actually get."
        />
        <div className="mt-8 overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <caption className="sr-only">Module availability by plan</caption>
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">Module</th>
                {visible.map((p) => (
                  <th key={p.id} scope="col" className="px-4 py-2.5 text-center font-medium">
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {MODULE_CATALOG.map((m) => (
                <tr key={m.id}>
                  <th scope="row" className="px-4 py-2 text-left font-normal">{m.label}</th>
                  {visible.map((p) => {
                    const on = p.features[m.id];
                    return (
                      <td key={p.id} className="px-4 py-2 text-center">
                        {on ? (
                          <Check className="mx-auto h-4 w-4 text-primary" aria-label="Included" />
                        ) : (
                          <Minus className="mx-auto h-4 w-4 text-muted-foreground/40" aria-label="Not included" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Certificates, Website CMS and AI are shown as unavailable on every tier because
          they are still in development. We would rather under-promise than sell you
          something that is not there yet.
        </p>
      </Section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <Section>
        <SectionHeading title="Pricing questions" />
        <div className="mx-auto mt-8 max-w-2xl divide-y divide-border rounded-xl border border-border bg-card">
          {PRICING_FAQS.map((f) => (
            <details key={f.q} className="group px-5 py-4">
              <summary className="cursor-pointer list-none font-medium marker:hidden">
                <span className="flex items-center justify-between gap-4">
                  {f.q}
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                </span>
              </summary>
              <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </Section>

      <CtaBand />
    </>
  );
};

export default PricingPage;

"use client";

import { useState } from "react";
import { PLANS, type Billing } from "@/lib/site";
import { Reveal } from "../ui/Reveal";
import { SectionHeading } from "../ui/SectionHeading";
import { BillingToggle } from "./BillingToggle";
import { PricingCard } from "./PricingCard";

/** Pricing table with a monthly/yearly toggle. */
function priceSummary(billing: Billing): string {
  const prices = PLANS.map(
    (plan) => `${plan.name} ${plan.price[billing]} ${plan.cadence[billing]}`,
  );
  return `Showing ${billing} prices: ${prices.join("; ")}.`;
}

export function Pricing() {
  const [billing, setBilling] = useState<Billing>("monthly");
  // One announcement per change instead of a live region on every card.
  const [summary, setSummary] = useState("");
  const changeBilling = (next: Billing) => {
    setBilling(next);
    setSummary(priceSummary(next));
  };

  return (
    <section
      id="pricing"
      aria-labelledby="pricing-title"
      className="border-t border-rule py-section"
    >
      <div className="container-page">
        <div className="flex flex-wrap items-end justify-between gap-8">
          <SectionHeading
            id="pricing"
            eyebrow="Pricing"
            title="Free to host. Fair when you scale."
            lead="pinpoint is MIT licensed and runs on your own infrastructure. These plans are illustrative, for the demo."
          />
          <BillingToggle value={billing} onChange={changeBilling} />
        </div>
        <p className="sr-only" aria-live="polite" data-testid="pricing-summary">
          {summary}
        </p>
        <Reveal className="mt-16 grid gap-6 lg:grid-cols-3">
          {PLANS.map((plan) => (
            <PricingCard key={plan.id} plan={plan} billing={billing} />
          ))}
        </Reveal>
      </div>
    </section>
  );
}

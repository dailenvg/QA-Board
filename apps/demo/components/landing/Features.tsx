import { FEATURES } from "@/lib/site";
import { FeatureCard } from "./FeatureCard";
import { Reveal } from "../ui/Reveal";
import { SectionHeading } from "../ui/SectionHeading";

/** Grid of product capabilities. */
export function Features() {
  return (
    <section
      id="features"
      aria-labelledby="features-title"
      className="border-t border-rule bg-sunken py-section"
    >
      <div className="container-page">
        <SectionHeading
          id="features"
          eyebrow="Features"
          title="Precise by design, quiet by default."
          lead="Built for agencies and product teams who review a lot of previews and want feedback they can act on without a meeting."
        />
        <Reveal className="mt-16 grid gap-6 sm:grid-cols-2 xl:grid-cols-3" stagger={0.06}>
          {FEATURES.map((feature) => (
            <FeatureCard key={feature.title} feature={feature} />
          ))}
        </Reveal>
      </div>
    </section>
  );
}

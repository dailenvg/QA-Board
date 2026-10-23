import { STEPS } from "@/lib/site";
import { Icon } from "../ui/Icon";
import { Reveal } from "../ui/Reveal";
import { RevealItem } from "../ui/RevealItem";
import { SectionHeading } from "../ui/SectionHeading";

/** Three numbered steps from link to pull request comment. */
export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-title"
      className="border-t border-rule py-section"
    >
      <div className="container-page">
        <SectionHeading
          id="how-it-works"
          eyebrow="How it works"
          title="From a preview link to a PR thread in three steps."
        />
        <Reveal className="mt-16 grid gap-px overflow-hidden rounded-card bg-rule ring-1 ring-rule md:grid-cols-3">
          {STEPS.map((step, index) => (
            <RevealItem
              key={step.title}
              as="article"
              testId={`step-${index + 1}`}
              className="flex flex-col gap-6 bg-raised p-8 lg:p-10"
            >
              <div className="flex items-center justify-between">
                <span className="grid size-12 place-items-center rounded-tile bg-accent-soft text-accent">
                  <Icon name={step.icon} className="size-6" />
                </span>
                <span className="font-display text-h3 text-muted">0{index + 1}</span>
              </div>
              <h3 className="font-display text-h3">{step.title}</h3>
              <p className="text-body text-muted">{step.body}</p>
            </RevealItem>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

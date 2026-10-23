import { FAQS } from "@/lib/site";
import { Reveal } from "../ui/Reveal";
import { RevealItem } from "../ui/RevealItem";
import { SectionHeading } from "../ui/SectionHeading";
import { FaqItem } from "./FaqItem";

/** Frequently asked questions. */
export function Faq() {
  return (
    <section
      id="faq"
      aria-labelledby="faq-title"
      className="border-t border-rule bg-sunken py-section"
    >
      <div className="container-page grid gap-12 lg:grid-cols-[1fr_1.4fr]">
        <SectionHeading id="faq" eyebrow="FAQ" title="Questions reviewers ask." />
        <Reveal className="border-t border-rule">
          {FAQS.map((faq) => (
            <RevealItem key={faq.question}>
              <FaqItem faq={faq} />
            </RevealItem>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

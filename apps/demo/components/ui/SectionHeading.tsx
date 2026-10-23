import { Reveal } from "./Reveal";
import { RevealItem } from "./RevealItem";

interface SectionHeadingProps {
  id: string;
  eyebrow: string;
  title: string;
  lead?: string;
}

/** Eyebrow, display title and optional lead shared by every landing section. */
export function SectionHeading({ id, eyebrow, title, lead }: SectionHeadingProps) {
  return (
    <Reveal className="max-w-3xl">
      <RevealItem>
        <p className="label-caps flex items-center gap-3 text-accent-text">
          <span aria-hidden="true" className="h-px w-8 bg-accent" />
          {eyebrow}
        </p>
      </RevealItem>
      <RevealItem>
        <h2 id={`${id}-title`} className="mt-5 font-display text-h2 text-balance">
          {title}
        </h2>
      </RevealItem>
      {lead ? (
        <RevealItem>
          <p className="mt-6 max-w-2xl text-lead text-muted text-pretty">{lead}</p>
        </RevealItem>
      ) : null}
    </Reveal>
  );
}

import type { Metadata } from "next";
import { SandboxHeader } from "@/components/sandbox/SandboxHeader";
import { SAMPLE_FAQ, SAMPLE_PLANS } from "@/components/sandbox/sample-content";

export const metadata: Metadata = { title: "Sample page" };

/**
 * Static sample page: something to review in Squint (as a website project) and
 * the host page for the pinpoint widget e2e tests. Deliberately unanimated so
 * pinned elements never move under a test.
 */
export default function SandboxPage() {
  return (
    <>
      <SandboxHeader />
      <main id="main">
        <section
          id="overview"
          className="container-page flex min-h-[80dvh] flex-col justify-center py-16"
        >
          <p className="label-caps text-brand-text">Sample page</p>
          <h1 className="mt-3 max-w-3xl text-display font-bold text-balance">
            A page made for leaving feedback on
          </h1>
          <p className="mt-4 max-w-2xl text-nav text-muted">
            Headlines, cards and questions to point at. Drop a pin on anything that looks off and
            say what should change.
          </p>
        </section>

        <section id="plans" aria-labelledby="plans-heading" className="container-page py-16">
          <h2 id="plans-heading" className="text-title font-bold">
            Plans
          </h2>
          <ul className="mt-6 grid gap-4 md:grid-cols-3">
            {SAMPLE_PLANS.map((plan) => (
              <li
                key={plan.id}
                data-testid={`sample-card-${plan.id}`}
                className="flex min-h-64 flex-col gap-3 rounded-panel bg-panel p-6"
              >
                <h3 className="text-heading font-bold">{plan.name}</h3>
                <p className="text-display font-bold">{plan.price}</p>
                <p className="text-body text-muted">{plan.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="faq" aria-labelledby="faq-heading" className="container-page py-16">
          <h2 id="faq-heading" className="text-title font-bold">
            Questions
          </h2>
          <dl className="mt-6 grid gap-4">
            {SAMPLE_FAQ.map((item) => (
              <div key={item.question} className="rounded-card bg-panel p-5">
                <dt className="text-heading font-semibold">{item.question}</dt>
                <dd className="mt-1.5 text-body text-muted">{item.answer}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>
      <footer className="container-page py-10 text-meta text-muted">
        Sample content for trying out Squint.
      </footer>
    </>
  );
}

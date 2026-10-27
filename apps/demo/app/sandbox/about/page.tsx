import type { Metadata } from "next";
import { SandboxHeader } from "@/components/sandbox/SandboxHeader";
import { SAMPLE_VALUES } from "@/components/sandbox/sample-content";

export const metadata: Metadata = { title: "About the sample" };

/**
 * A second page of the sample site, so reviewing more than one page of a
 * website (and following the framed site from page to page) has something to
 * open. Unanimated, like the home page.
 */
export default function SandboxAboutPage() {
  return (
    <>
      <SandboxHeader current="/sandbox/about" />
      <main id="main">
        <section className="container-page flex min-h-[60dvh] flex-col justify-center py-16">
          <p className="label-caps text-brand-text">Sample page</p>
          <h1 className="mt-3 max-w-3xl text-display font-bold text-balance">
            About this sample site
          </h1>
          <p className="mt-4 max-w-2xl text-nav text-muted">
            A second page to review. Comments left here stay with this page, apart from the ones on
            the home page.
          </p>
        </section>

        <section aria-labelledby="values-heading" className="container-page py-16">
          <h2 id="values-heading" className="text-title font-bold">
            What we value
          </h2>
          <ul className="mt-6 grid gap-4 md:grid-cols-3">
            {SAMPLE_VALUES.map((value) => (
              <li
                key={value.title}
                className="flex min-h-48 flex-col gap-3 rounded-panel bg-panel p-6"
              >
                <h3 className="text-heading font-bold">{value.title}</h3>
                <p className="text-body text-muted">{value.body}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <footer className="container-page py-10 text-meta text-muted">
        Sample content for trying out Squint.
      </footer>
    </>
  );
}

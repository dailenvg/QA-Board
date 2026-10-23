import { CONTACT_EMAIL, CONTACT_ID, NAV_SECTIONS, SITE } from "@/lib/site";
import { Logo } from "./Logo";

const LINK = "inline-flex min-h-11 items-center text-body hover:text-accent-text sm:text-small";

/** Footer with section links, contact details and license note. */
export function SiteFooter() {
  return (
    <footer className="border-t border-rule">
      <div className="container-page grid gap-10 py-16 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div className="max-w-sm">
          <Logo />
          <p className="mt-4 text-body text-muted sm:text-small">
            {SITE.tagline}. Open source, self-hosted, MIT licensed.
          </p>
        </div>
        <nav aria-label="Footer">
          <p className="label-caps text-muted">Product</p>
          <ul className="mt-4 space-y-1">
            {NAV_SECTIONS.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`} className={LINK}>
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div>
          <p className="label-caps text-muted">Source</p>
          <ul className="mt-4 space-y-1">
            <li>
              <a href={SITE.repoUrl} className={LINK} target="_blank" rel="noreferrer">
                GitHub repository
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </li>
          </ul>
        </div>
        <section id={CONTACT_ID} aria-labelledby="contact-title" className="scroll-mt-24">
          <h2 id="contact-title" className="label-caps text-muted">
            Contact
          </h2>
          <p className="mt-4 text-body text-muted sm:text-small">
            Questions about Team or Organization plans?
          </p>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className={`${LINK} font-medium`}
            data-testid="contact-email"
          >
            {CONTACT_EMAIL}
          </a>
        </section>
      </div>
      <div className="container-page flex flex-wrap items-center justify-between gap-4 border-t border-rule py-6 text-body text-muted sm:text-small">
        <p>© {new Date().getFullYear()} pinpoint contributors</p>
        <p>This is a demo site. Pricing is illustrative.</p>
      </div>
    </footer>
  );
}

import { NAV_SECTIONS, SITE } from "@/lib/site";
import { Logo } from "./Logo";

/** Footer with section links and license note. */
export function SiteFooter() {
  return (
    <footer className="border-t border-rule">
      <div className="container-page grid gap-10 py-16 md:grid-cols-[1.5fr_1fr_1fr]">
        <div className="max-w-sm">
          <Logo />
          <p className="mt-4 text-small text-muted">
            {SITE.tagline}. Open source, self-hosted, MIT licensed.
          </p>
        </div>
        <nav aria-label="Footer">
          <p className="label-caps text-muted">Product</p>
          <ul className="mt-4 space-y-1">
            {NAV_SECTIONS.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="inline-flex min-h-11 items-center text-small hover:text-accent"
                >
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
              <a
                href={SITE.repoUrl}
                className="inline-flex min-h-11 items-center text-small hover:text-accent"
                target="_blank"
                rel="noreferrer"
              >
                GitHub repository
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="container-page flex flex-wrap items-center justify-between gap-4 border-t border-rule py-6 text-small text-muted">
        <p>© {new Date().getFullYear()} pinpoint contributors</p>
        <p>This is a demo site. Pricing is illustrative.</p>
      </div>
    </footer>
  );
}

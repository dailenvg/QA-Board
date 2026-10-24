import { Logo } from "../brand/Logo";

const LINKS = [
  { href: "#overview", label: "Overview" },
  { href: "#plans", label: "Plans" },
  { href: "#faq", label: "FAQ" },
];

/** Sticky header with in-page anchors. */
export function SandboxHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur-md">
      <nav
        aria-label="Primary"
        className="container-page flex min-h-16 items-center justify-between gap-4"
      >
        <Logo />
        <ul className="flex items-center gap-1">
          {LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="inline-flex min-h-11 items-center rounded-pill px-3 text-body font-semibold transition-colors hover:bg-hover"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}

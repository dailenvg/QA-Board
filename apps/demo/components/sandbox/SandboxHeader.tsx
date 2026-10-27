import Link from "next/link";
import { Logo } from "../brand/Logo";

const SECTIONS = [
  { href: "#overview", label: "Overview" },
  { href: "#plans", label: "Plans" },
  { href: "#faq", label: "FAQ" },
];

/** The sample site's pages. Client-side links, so a framed sandbox navigates like an SPA. */
const PAGES = [
  { href: "/sandbox", label: "Home" },
  { href: "/sandbox/about", label: "About" },
] as const;

export type SandboxPage = (typeof PAGES)[number]["href"];

const LINK_CLASS =
  "inline-flex min-h-11 items-center rounded-pill px-3 text-body font-semibold transition-colors hover:bg-hover aria-[current=page]:bg-seg";

/** Sticky header with the sample site's pages, and in-page anchors on its home page. */
export function SandboxHeader({ current }: { current: SandboxPage }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur-md">
      <nav
        aria-label="Primary"
        className="container-page flex min-h-16 flex-wrap items-center justify-between gap-x-4"
      >
        <Logo />
        <ul className="flex flex-wrap items-center gap-1">
          {current === "/sandbox"
            ? SECTIONS.map((link) => (
                <li key={link.href}>
                  <a href={link.href} className={LINK_CLASS}>
                    {link.label}
                  </a>
                </li>
              ))
            : null}
          {PAGES.map((page) => (
            <li key={page.href}>
              <Link
                href={page.href}
                aria-current={page.href === current ? "page" : undefined}
                className={LINK_CLASS}
              >
                {page.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}

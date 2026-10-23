"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { duration, ease } from "@/lib/motion";
import { NAV_SECTIONS, SITE } from "@/lib/site";
import { useActiveSection } from "@/lib/use-active-section";
import { ButtonLink } from "../ui/ButtonLink";
import { Icon } from "../ui/Icon";
import { Logo } from "./Logo";
import { NavLinks } from "./NavLinks";

const SECTION_IDS = NAV_SECTIONS.map((section) => section.id);

/** Sticky header with scroll-spy navigation and an animated mobile menu. */
export function SiteHeader() {
  const active = useActiveSection(SECTION_IDS);
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const toggleRef = useRef<HTMLButtonElement>(null);

  // Escape closes the open menu and hands focus back to its toggle.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      toggleRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-paper/85 backdrop-blur-md">
      <nav
        aria-label="Primary"
        className="container-page flex h-18 items-center justify-between gap-6"
      >
        <Logo />
        <div className="hidden md:block">
          <NavLinks active={active} layout="row" />
        </div>
        <div className="flex items-center gap-2">
          <ButtonLink
            href={SITE.repoUrl}
            variant="secondary"
            external
            className="hidden sm:inline-flex"
          >
            <Icon name="github" className="size-4" />
            GitHub
          </ButtonLink>
          <button
            ref={toggleRef}
            type="button"
            className="grid size-11 place-items-center rounded-control ring-1 ring-rule-strong ring-inset transition-colors hover:bg-sunken active:bg-sunken md:hidden"
            aria-expanded={open}
            aria-controls={open ? "mobile-menu" : undefined}
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((value) => !value)}
          >
            <Icon name={open ? "close" : "menu"} />
          </button>
        </div>
      </nav>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id="mobile-menu"
            key="mobile-menu"
            className="overflow-hidden border-t border-rule md:hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0 : duration.component, ease: ease.out }}
          >
            <div className="container-page py-4">
              <NavLinks active={active} layout="stack" onNavigate={() => setOpen(false)} />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}

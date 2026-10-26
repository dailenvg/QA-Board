"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { duration, usePopVariants } from "@/lib/motion";
import { useIsClient } from "@/lib/use-is-client";
import { Icon } from "./Icon";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
  testId?: string;
}

/** Tab stops only: roving-tabindex items (such as unselected radios) are skipped. */
function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => element.tabIndex >= 0,
  );
}

/**
 * Where focus goes when a dialog closes and the element that opened it is
 * gone (such as the menu of a folder just deleted): the page's heading, else
 * its main region, made focusable for this.
 */
function fallbackFocus(): void {
  const target =
    document.querySelector<HTMLElement>("main h1") ?? document.querySelector<HTMLElement>("main");
  if (!target) return;
  if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
}

/** Traps Tab inside the panel and closes on Escape; on close, focus goes back. */
function useFocusTrap(open: boolean, panel: RefObject<HTMLDivElement | null>, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const node = panel.current;
    const initial =
      node?.querySelector<HTMLElement>("[data-autofocus]") ?? (node ? focusables(node)[0] : null);
    initial?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // An open list or popup inside the dialog closes first; the next Escape closes the dialog.
        if (event.target instanceof Element && event.target.closest("[data-popup-open]")) return;
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !node) return;
      const items = focusables(node);
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      // Focus fell out of the panel (its element was removed or disabled): bring it back
      // instead of letting Tab reach the page behind the modal.
      if (!node.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
      // A frame later, so a page that replaces the removed one can render its heading first.
      else requestAnimationFrame(fallbackFocus);
    };
  }, [open, panel]);
}

const WIDTHS = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-4xl" } as const;

/** Modal dialog: focus-trapped, Escape and backdrop close it, focus returns to the opener. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  size = "md",
  testId,
}: DialogProps) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const variants = usePopVariants();
  const isClient = useIsClient();
  useFocusTrap(open, panel, onClose);

  if (!isClient) return null;
  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-end p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:place-items-center sm:p-6">
          <motion.div
            className="absolute inset-0 bg-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: duration.micro }}
            onClick={onClose}
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            data-testid={testId}
            variants={variants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={`relative flex max-h-[calc(100dvh-1.5rem)] w-full flex-col overflow-y-auto rounded-panel bg-panel p-5 shadow-pop sm:p-6 ${WIDTHS[size]}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 id={titleId} className="text-title font-bold">
                  {title}
                </h2>
                {description ? (
                  <div id={descriptionId} className="mt-1 text-body text-muted">
                    {description}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="-mt-2 -mr-2 grid size-11 shrink-0 place-items-center rounded-pill text-muted transition-colors hover:bg-hover hover:text-ink active:bg-seg"
              >
                <Icon name="close" />
              </button>
            </div>
            <div className="mt-5">{children}</div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import { duration, ease, useRevealVariants } from "@/lib/motion";
import { MAX_PDF_PAGES } from "@/lib/pdf/render-pdf";
import { useObjectUrl } from "@/lib/use-object-url";
import { Button } from "../ui/Button";
import { FieldError } from "../ui/FieldError";
import { Icon } from "../ui/Icon";
import { Skeleton } from "../ui/Skeleton";
import type { PdfImport } from "./use-pdf-import";

const ACCEPT_PDF = "application/pdf,.pdf";

interface PdfPickerProps {
  state: PdfImport;
  /** A form-level problem, such as "Choose a PDF." */
  error: string | null;
  onFile: (file: File) => void;
  onTakeFirstPages: () => void;
  onCancel: () => void;
}

function Progress({
  page,
  total,
  onCancel,
}: {
  page: number;
  total: number;
  onCancel: () => void;
}) {
  const reduce = useReducedMotion();
  return (
    <div className="flex items-center gap-3 rounded-tile bg-card p-3 ring-1 ring-line ring-inset">
      <div className="min-w-0 flex-1">
        {/* Not a live region: per-page updates would queue up. The picker announces the step. */}
        <p data-testid="pdf-progress" className="text-body font-semibold">
          Rendering page {page} of {total}
        </p>
        <div
          role="progressbar"
          aria-label="Rendering pages"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={page - 1}
          className="mt-2 h-2 overflow-hidden rounded-pill bg-seg"
        >
          {/* brand-text: cobalt is 2.2:1 on the dark track (WCAG 1.4.11), its dark variant 8:1. */}
          <motion.div
            className="h-full origin-left rounded-pill bg-brand-text"
            initial={false}
            animate={{ scaleX: (page - 1) / total }}
            transition={{ duration: reduce ? 0 : duration.component, ease: ease.out }}
          />
        </div>
      </div>
      {/* Not "Cancel": the dialog's own Cancel is on screen too, and closes it. */}
      <Button variant="secondary" size="sm" onClick={onCancel}>
        Stop rendering
      </Button>
    </div>
  );
}

function Ready({ fileName, first, count }: { fileName: string; first: Blob; count: number }) {
  const url = useObjectUrl(first);
  return (
    <div
      data-testid="pdf-ready"
      className="flex items-center gap-3 rounded-tile bg-card p-2 ring-1 ring-line ring-inset"
    >
      <span className="relative size-14 shrink-0 overflow-hidden rounded-row bg-tile">
        {url ? (
          <Image src={url} alt="" fill unoptimized className="object-cover object-top" />
        ) : (
          <Skeleton className="size-full" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body font-semibold">{fileName}</span>
        <span className="block text-meta text-muted">
          {count === 1 ? "1 page" : `${count} pages`}, ready
        </span>
      </span>
    </div>
  );
}

/** The step a chosen PDF is at: reading, the page-limit choice, rendering, ready. */
function StatusPanel({
  state,
  onTakeFirstPages,
  onCancel,
}: Omit<PdfPickerProps, "error" | "onFile">) {
  switch (state.status) {
    case "opening":
      return <p className="text-body text-muted">Reading {state.fileName}…</p>;
    case "confirm":
      return (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-tile bg-card p-4 ring-1 ring-line ring-inset"
        >
          <p className="text-body">
            <span className="font-semibold">{state.fileName}</span> has {state.pageCount} pages. A
            project holds up to {MAX_PDF_PAGES}.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={onTakeFirstPages}>
              Use the first {MAX_PDF_PAGES} pages
            </Button>
            <Button variant="secondary" size="sm" onClick={onCancel}>
              Choose another PDF
            </Button>
          </div>
        </div>
      );
    case "rendering":
      return <Progress page={state.page} total={state.total} onCancel={onCancel} />;
    case "ready": {
      const [first] = state.pages;
      return first ? (
        <Ready fileName={state.fileName} first={first.blob} count={state.pages.length} />
      ) : null;
    }
    default:
      return null;
  }
}

const pageCount = (count: number) => (count === 1 ? "1 page" : `${count} pages`);

/** One announcement per step (not per page), read from a region that's always there. */
function announcement(state: PdfImport): string {
  switch (state.status) {
    case "opening":
      return `Reading ${state.fileName}…`;
    case "rendering":
      return `Rendering ${pageCount(state.total)}…`;
    case "ready":
      return `${state.fileName}: ${pageCount(state.pages.length)}, ready.`;
    default:
      // The page-limit choice is an alert, and errors are announced by FieldError.
      return "";
  }
}

/**
 * One PDF (up to 50 MB): a drop target and file picker, then its progress
 * through reading and rendering, with Stop rendering, and its errors.
 */
export function PdfPicker({ state, error, onFile, onTakeFirstPages, onCancel }: PdfPickerProps) {
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const variants = useRevealVariants();
  const [dragging, setDragging] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const message = state.status === "failed" ? state.error : error;
  const busy = state.status === "opening" || state.status === "rendering";

  // Each step's buttons leave with it (Use the first 50, Stop rendering). If focus was on one, it
  // moves to the next step's button, or back to the file picker, never to the page.
  useEffect(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return;
    const step = active.closest<HTMLElement>("[data-pdf-step]");
    if (!step || step.dataset.pdfStep === state.status) return;
    const next = root.current?.querySelector<HTMLElement>(
      `[data-pdf-step="${state.status}"] button`,
    );
    (next ?? input.current)?.focus();
  }, [state.status]);

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    const [file] = event.dataTransfer.files;
    if (file && !busy) onFile(file);
  };

  return (
    <div ref={root} className="flex flex-col gap-3">
      <div>
        <span className="mb-2 block text-body font-semibold" id={`${inputId}-label`}>
          PDF
        </span>
        <label
          htmlFor={inputId}
          aria-disabled={busy || undefined}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          data-testid="pdf-dropzone"
          className={`relative flex flex-col items-center justify-center gap-2 overflow-hidden rounded-tile border-2 border-dashed p-5 text-center transition-colors has-[input:focus-visible]:border-focus has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-focus aria-disabled:cursor-progress aria-disabled:opacity-60 ${
            state.status === "idle" || state.status === "failed" ? "min-h-40" : "min-h-24"
          } ${
            dragging
              ? "border-brand bg-brand-soft"
              : message
                ? "cursor-pointer border-danger bg-card hover:bg-hover"
                : "cursor-pointer border-field-line bg-card hover:bg-hover active:bg-seg"
          }`}
        >
          <Icon name="fileText" className="size-6 text-muted" />
          <span className="text-body font-semibold">
            {state.status === "ready"
              ? "Choose a different PDF"
              : "Drop a PDF here, or choose a file"}
          </span>
          <span id={hintId} className="text-meta text-muted">
            One PDF, up to 50 MB. Each page becomes a page of the project (up to {MAX_PDF_PAGES}).
          </span>
          {/*
           * aria-disabled, not disabled, while busy: disabling the focused input would drop
           * keyboard focus to the page. Clicks are refused instead.
           */}
          <input
            ref={input}
            id={inputId}
            type="file"
            accept={ACCEPT_PDF}
            aria-disabled={busy || undefined}
            aria-labelledby={`${inputId}-label`}
            aria-describedby={`${hintId} ${errorId}`}
            aria-invalid={message ? true : undefined}
            data-testid="pdf-input"
            onClick={(event) => {
              if (busy) event.preventDefault();
            }}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file && !busy) onFile(file);
              event.target.value = "";
            }}
            className="sr-only"
          />
        </label>
        <FieldError id={errorId} message={message} />
      </div>
      <AnimatePresence initial={false} mode="popLayout">
        {state.status === "idle" || state.status === "failed" ? null : (
          <motion.div
            key={state.status}
            data-pdf-step={state.status}
            variants={variants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <StatusPanel state={state} onTakeFirstPages={onTakeFirstPages} onCancel={onCancel} />
          </motion.div>
        )}
      </AnimatePresence>
      <p aria-live="polite" className="sr-only">
        {announcement(state)}
      </p>
    </div>
  );
}

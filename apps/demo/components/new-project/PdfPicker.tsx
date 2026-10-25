"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import { useId, useState, type DragEvent } from "react";
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
        <p role="status" data-testid="pdf-progress" className="text-body font-semibold">
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
          <motion.div
            className="h-full origin-left rounded-pill bg-brand"
            initial={false}
            animate={{ scaleX: (page - 1) / total }}
            transition={{ duration: reduce ? 0 : duration.component, ease: ease.out }}
          />
        </div>
      </div>
      <Button variant="secondary" size="sm" onClick={onCancel}>
        Cancel
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
      return (
        <p role="status" className="text-body text-muted">
          Reading {state.fileName}…
        </p>
      );
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
              Cancel
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

/**
 * One PDF (up to 50 MB): a drop target and file picker, then its progress
 * through reading and rendering, with Cancel, and its errors.
 */
export function PdfPicker({ state, error, onFile, onTakeFirstPages, onCancel }: PdfPickerProps) {
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const variants = useRevealVariants();
  const [dragging, setDragging] = useState(false);
  const message = state.status === "failed" ? state.error : error;
  const busy = state.status === "opening" || state.status === "rendering";

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    const [file] = event.dataTransfer.files;
    if (file && !busy) onFile(file);
  };

  return (
    <div className="flex flex-col gap-3">
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
          <input
            id={inputId}
            type="file"
            accept={ACCEPT_PDF}
            disabled={busy}
            aria-labelledby={`${inputId}-label`}
            aria-describedby={`${hintId} ${errorId}`}
            aria-invalid={message ? true : undefined}
            data-testid="pdf-input"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onFile(file);
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
            variants={variants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <StatusPanel state={state} onTakeFirstPages={onTakeFirstPages} onCancel={onCancel} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

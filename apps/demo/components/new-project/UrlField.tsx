"use client";

import { useId } from "react";
import { displayHost, normalizeUrl } from "@/lib/url";
import { FieldError } from "../ui/FieldError";
import { FIELD_CLASS } from "../ui/field-styles";
import { Icon } from "../ui/Icon";

interface UrlFieldProps {
  value: string;
  error: string | null;
  onChange: (value: string) => void;
  /** Validates and normalizes (for example adds https://) when focus leaves the field. */
  onBlur: () => void;
}

/**
 * The website address field. Below it, a blank browser window fills whatever room the image and
 * PDF dropzones leave in the shared cell (SourcePanel), so the Website tab is as full as theirs:
 * the card a website project starts with (ProjectThumbnail's SiteCard), its address bar showing
 * the host once what's typed is a web address. Decorative (aria-hidden), and it adds no height of
 * its own: in a cell with no room to spare it's simply not there.
 */
export function UrlField({ value, error, onChange, onBlur }: UrlFieldProps) {
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const checked = normalizeUrl(value);
  const host = checked.ok ? displayHost(checked.url) : null;
  return (
    <div className="flex flex-1 flex-col">
      <label htmlFor={inputId} className="mb-2 block text-body font-semibold">
        Website address
      </label>
      <input
        id={inputId}
        data-autofocus
        type="url"
        required
        inputMode="url"
        autoComplete="url"
        spellCheck={false}
        placeholder="example.com"
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${hintId} ${errorId}`}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        className={FIELD_CLASS}
      />
      <p id={hintId} className="mt-2 text-meta text-muted">
        Some sites block embedding. If so, you can upload a screenshot instead.
      </p>
      <FieldError id={errorId} message={error} />
      <BrowserWindow host={host} />
    </div>
  );
}

/**
 * Fills the rest of the panel, its window drawn inside (16px below the field) so it never makes
 * the panel taller: with under 16px to spare nothing shows, and the window clips from the bottom.
 */
function BrowserWindow({ host }: { host: string | null }) {
  return (
    <div aria-hidden="true" data-testid="url-preview" className="relative min-h-0 flex-1">
      <div className="absolute inset-x-0 top-4 bottom-0 flex flex-col overflow-hidden rounded-tile bg-tile">
        <div className="flex h-8 shrink-0 items-center gap-1 px-3">
          <span className="size-2 shrink-0 rounded-pill bg-line-strong" />
          <span className="size-2 shrink-0 rounded-pill bg-line-strong" />
          <span className="size-2 shrink-0 rounded-pill bg-line-strong" />
          <span className="ml-2 flex h-5 min-w-0 flex-1 items-center rounded-pill bg-card px-2 text-meta text-muted">
            <span className="truncate">{host}</span>
          </span>
        </div>
        <div className="grid min-h-0 flex-1 place-items-center text-muted">
          <Icon name="globe" className="size-6" />
        </div>
      </div>
    </div>
  );
}

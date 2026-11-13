/**
 * The client a review link is for, as its owner names them in the Share
 * window (038): "{Company} has invited {Client} to review {Project}", and the
 * invitation email's "Hi {Client},".
 */

/** Longest client name kept, in characters; `squint_shares` checks it too. */
export const CLIENT_NAME_MAX = 80;

/**
 * A client name that stays on one line wherever it's shown (a heading, an
 * email's greeting, a link preview) and reads as typed: control characters,
 * line and paragraph separators turn into spaces; the format characters that
 * can flip or hide text go (bidi marks, embeddings, overrides and isolates
 * such as U+202E, zero-width spaces, the BOM), while the joiners U+200C and
 * U+200D stay, since emoji sequences and some scripts' spelling need them;
 * spaces collapse, and the ends are trimmed.
 * Everything else is kept as typed (punctuation, apostrophes, accents): every
 * place that shows it escapes it.
 */
/** Bidi marks, embeddings, overrides and isolates, zero-width spaces and the BOM. */
const HIDDEN = /[\u200B\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

export function cleanClientName(name: string | null | undefined): string {
  return (name ?? "")
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, " ")
    .replace(HIDDEN, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** A cleaned name as stored: null for none (nothing left once cleaned). */
export function storedClientName(name: string | null | undefined): string | null {
  return cleanClientName(name) || null;
}

/** Why a typed client name can't be saved, or null when it can (blank clears it). */
export function clientNameError(name: string): string | null {
  return Array.from(cleanClientName(name)).length > CLIENT_NAME_MAX
    ? `Use at most ${CLIENT_NAME_MAX} characters.`
    : null;
}

import { contrast } from "../color";
import { escapeHtml } from "./resend";

/**
 * The pieces of a workspace's branded email (a review invitation, an invite
 * to join): the company's icon and name on top, paragraphs in one body type,
 * and one button in the company's color. Every value is escaped here.
 */

/** How the email shows the company. */
export interface EmailBrand {
  /** The company's icon (logo or default mark), absolute; null: the name alone. */
  iconUrl: string | null;
  /** `#rrggbb`, for the button and the link; null keeps Squint's blue. */
  color: string | null;
}

export const NO_BRAND: EmailBrand = { iconUrl: null, color: null };

const INK = "#18181b";
const MUTED = "#62626b";
const BRAND = "#0c54cc";
const FONT = "Helvetica, Arial, sans-serif";
/** WCAG AA for the button's white label, and for the link on white. */
const MIN_TEXT_CONTRAST = 4.5;

/** The company's color for the button and link when white text reads on it, else Squint's blue. */
export function emailAccent(color: string | null): string {
  return color && contrast(color, "#ffffff") >= MIN_TEXT_CONTRAST ? color : BRAND;
}

/** A subject can't break its header: line breaks and control characters become spaces. */
export function oneLine(value: string): string {
  return value
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The company's icon beside its name: a table, which every inbox lays out. */
export function brandHeader(company: string, iconUrl: string | null): string {
  const icon = iconUrl
    ? `<td style="padding:0 12px 0 0;vertical-align:middle"><img src="${escapeHtml(iconUrl)}" width="40" height="40" alt="" style="display:block;width:40px;height:40px;border:0;border-radius:10px"></td>`
    : "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px"><tr>${icon}<td style="vertical-align:middle;font:700 16px/1.3 ${FONT};color:${INK}">${escapeHtml(company)}</td></tr></table>`;
}

/** A paragraph in the email's body type. */
export const paragraph = (text: string, color = INK) =>
  `<p style="margin:0 0 16px;font:15px/1.5 ${FONT};color:${color}">${escapeHtml(text)}</p>`;

/** The email's heading. */
export const headline = (text: string) =>
  `<h1 style="margin:0 0 24px;font:700 22px/1.3 ${FONT};color:${INK}">${escapeHtml(text)}</h1>`;

/** The one button, to `href`, in `accent`. */
export const button = (href: string, label: string, accent: string) =>
  `<p style="margin:0 0 24px"><a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 24px;border-radius:999px;background:${accent};color:#ffffff;font:600 15px/1.2 ${FONT};text-decoration:none">${escapeHtml(label)}</a></p>`;

/** The link written out, for an inbox that doesn't show the button. */
export const fallbackLink = (href: string, accent: string) =>
  `<p style="margin:24px 0 0;font:13px/1.4 ${FONT};color:${MUTED}">If the button doesn't work, paste this link into your browser: <a href="${escapeHtml(href)}" style="color:${accent}">${escapeHtml(href)}</a></p>`;

/** Why it came, at the bottom. */
export const footerNote = (text: string) =>
  `<p style="margin:16px 0 0;font:13px/1.4 ${FONT};color:${MUTED}">${escapeHtml(text)}</p>`;

import { cleanClientName, HIDDEN } from "../../share/client-name";

/**
 * What "Send to ClickUp" posts: who sent it, in bold ("Ana Ruiz sent you
 * this project to review it through Squint"), then the sender's note. No
 * project name or link: ClickUp turns a name like a site's address into a
 * link, and it unfurls a link into its card only when it's pasted in
 * ClickUp, so the sender pastes the project's link under this message.
 * Markdown (`text/md`), with every mark in the sender's name and the note
 * made literal, so neither can add a link, a mention or formatting. No Node
 * imports: the dialog's limits and preview read this too.
 */

/** Longest note, in characters. */
export const NOTE_MAX = 1000;

/** Who sent it, when their Squint account has neither a name nor an email to show. */
export const UNNAMED_SENDER = "Someone on your team";

/** The name of a project whose own is blank once cleaned. */
export const UNTITLED_PROJECT = "Untitled project";

/** Every ASCII punctuation mark: CommonMark lets a backslash make each one literal. */
const PUNCTUATION = /[!-/:-@[-`{-~]/g;

/** `text` as literal Markdown: each punctuation mark backslash-escaped (links, mentions, emphasis, lists). */
export function escapeMarkdown(text: string): string {
  return text.replace(PUNCTUATION, (mark) => `\\${mark}`);
}

/**
 * A note as sent: line breaks kept (at most one blank line in a row), other
 * control characters as spaces, the characters that hide or flip text gone,
 * spaces collapsed, and each line and the whole trimmed. Its length is
 * checked against `NOTE_MAX` after this (`noteLength`).
 */
export function cleanNote(note: string): string {
  return note
    .replace(/\r\n?|[\u2028\u2029]/g, "\n")
    .replace(/[^\P{Cc}\n]/gu, " ")
    .replace(HIDDEN, "")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * The project's name as the message and its preview show it: on one line,
 * with nothing hidden or flipped (`cleanClientName`'s rules), else
 * `UNTITLED_PROJECT`. A line break left in would end the bold early.
 */
export function messageProjectName(name: string): string {
  return cleanClientName(name) || UNTITLED_PROJECT;
}

/**
 * The message's first line, as the preview shows it too: "Ana Ruiz sent you
 * this project to review it through Squint". `sender` is the member's name
 * in Squint (else their email), on one line with nothing hidden or flipped.
 */
export function sentBy(sender: string): string {
  const name = cleanClientName(sender) || UNNAMED_SENDER;
  return `${name} sent you this project to review it through Squint`;
}

/** A note's length as `NOTE_MAX` counts it: characters (not UTF-16 units) once cleaned. */
export function noteLength(note: string): number {
  return Array.from(cleanNote(note)).length;
}

/** A note's paragraphs, each a list of its lines: how the preview lays it out. */
export function noteParagraphs(note: string): string[][] {
  const cleaned = cleanNote(note);
  return cleaned ? cleaned.split("\n\n").map((paragraph) => paragraph.split("\n")) : [];
}

/** A cleaned note in Markdown: its lines kept apart by hard breaks, its paragraphs by blank lines. */
function noteMarkdown(note: string): string {
  return noteParagraphs(note)
    .map((lines) => lines.map(escapeMarkdown).join("\\\n"))
    .join("\n\n");
}

export interface MessageParts {
  /** The member sending it: their name in Squint, else their email. Cleaned here (`sentBy`). */
  sender: string;
  /** As typed: cleaned here. Empty for none. */
  note: string;
}

/**
 * The message's Markdown, a paragraph each (a blank line apart, so ClickUp
 * doesn't run them together): who sent it in bold, then the note when there
 * is one.
 */
export function clickUpMessage({ sender, note }: MessageParts): string {
  const blocks = [`**${escapeMarkdown(sentBy(sender))}**`];
  const body = noteMarkdown(note);
  if (body) blocks.push(body);
  return blocks.join("\n\n");
}

import { cleanClientName, HIDDEN } from "../../share/client-name";

/**
 * What "Send to ClickUp" posts: the project's name linking to its page in
 * Squint, the sender's note, and a short "Sent for review from Squint". Markdown
 * (`text/md`), with every mark in the name and the note made literal, so
 * neither can add a link, a mention or formatting. No Node imports: the
 * dialog's limits and preview read this too.
 */

/** Longest note, in characters. */
export const NOTE_MAX = 1000;

/** Most followers on one message. */
export const FOLLOWERS_MAX = 10;

/** The closing line, as the preview shows it too. */
export const SENT_FROM = "Sent for review from Squint";

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
 * `UNTITLED_PROJECT`. A line break left in would end the bold link early.
 */
export function messageProjectName(name: string): string {
  return cleanClientName(name) || UNTITLED_PROJECT;
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

/** A link's address, with the brackets Markdown would end it at encoded. */
function linkAddress(url: string): string {
  return url.replace(
    /[()<>\s]/g,
    (mark) => `%${mark.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`,
  );
}

export interface MessageParts {
  /** As stored: cleaned here (`messageProjectName`). */
  projectName: string;
  /** The project's page in Squint, absolute. */
  projectUrl: string;
  /** As typed: cleaned here. Empty for none. */
  note: string;
}

/** The message's Markdown. */
export function clickUpMessage({ projectName, projectUrl, note }: MessageParts): string {
  const name = escapeMarkdown(messageProjectName(projectName));
  const blocks = [`**[${name}](${linkAddress(projectUrl)})**`];
  const body = noteMarkdown(note);
  if (body) blocks.push(body);
  blocks.push(`_${escapeMarkdown(SENT_FROM)}_`);
  return blocks.join("\n\n");
}

import { z } from "zod";
import { pinSchema } from "../schemas";
import { StorageLimitError } from "../storage";
import type { Pin } from "../types";
import { blockquote, escapeInline, linkTarget } from "./markdown";

/** GitHub rejects issue comments longer than this. */
export const MAX_COMMENT_LENGTH = 65_536;
const RESOLVED_PREFIX = "✅ ";
const BLOCK = /^<!-- pinpoint:([^>]*) -->/;
const recordSchema = z.object({ v: z.literal(1), pin: pinSchema });

/**
 * JSON with `<`, `>` and `&` written as unicode escapes. With `>` gone the
 * payload can never contain `-->`, so user text cannot end the hidden block.
 */
function encodeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

function renderHeading(pin: Pin): string {
  const priority = pin.priority ? ` · \`${pin.priority}\`` : "";
  const prefix = pin.resolved ? RESOLVED_PREFIX : "";
  return `### ${prefix}Pinpoint comment${priority}`;
}

function renderLinks(pin: Pin): string {
  const deepLink = linkTarget(pin.deepLink);
  const screenshot = linkTarget(pin.screenshotUrl);
  const links = [
    deepLink ? `[Open on preview](${deepLink})` : null,
    screenshot ? `[Screenshot](${screenshot})` : null,
  ].filter(Boolean);
  const image = screenshot ? `\n\n![Screenshot of the page](${screenshot})` : "";
  return `${links.join(" · ")}${image}`;
}

function renderReplies(pin: Pin): string {
  if (pin.replies.length === 0) return "";
  const items = pin.replies.map(
    (reply) => `**${escapeInline(reply.author)}** replied:\n\n${blockquote(reply.body)}`,
  );
  return `\n\n**Replies**\n\n${items.join("\n\n")}`;
}

function renderResolution(pin: Pin): string {
  if (!pin.resolved) return "";
  const by = pin.resolvedBy ? ` by ${escapeInline(pin.resolvedBy)}` : "";
  return `\n\n<sub>Resolved${by}${pin.resolvedAt ? ` on ${pin.resolvedAt.slice(0, 10)}` : ""}</sub>`;
}

/**
 * Serialises a pin to a GitHub comment: a hidden machine-readable block
 * first, then a human-readable rendering with every user field escaped.
 */
export function encodePinComment(pin: Pin): string {
  const body = [
    `<!-- pinpoint:${encodeJson({ v: 1, pin })} -->`,
    renderHeading(pin),
    `**${escapeInline(pin.author)}** on \`${pin.path.replace(/`/g, "")}\`:`,
    blockquote(pin.body),
    renderLinks(pin),
  ].join("\n\n");
  const full = `${body}${renderReplies(pin)}${renderResolution(pin)}`;
  if (full.length > MAX_COMMENT_LENGTH) {
    throw new StorageLimitError("This thread is too long to store in a GitHub comment");
  }
  return full;
}

/** Reads the hidden block back. Only a block at the very start counts. */
export function decodePinComment(body: string): Pin | null {
  const payload = BLOCK.exec(body)?.[1];
  if (!payload) return null;
  try {
    const record = recordSchema.safeParse(JSON.parse(payload));
    return record.success ? record.data.pin : null;
  } catch {
    return null;
  }
}

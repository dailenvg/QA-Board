import { describe, expect, it } from "vitest";
import {
  cleanSenderName,
  parseFromAddress,
  SENDER_NAME_MAX,
  workspaceFromHeader,
} from "./from-header";

const FROM = "Squint <noreply@squintreview.com>";

describe("a workspace's From header", () => {
  it("is the sender name via Squint, at EMAIL_FROM's address", () => {
    expect(workspaceFromHeader({ fromEmailName: null, workspaceName: "ONE Agency" }, FROM)).toBe(
      '"ONE Agency via Squint" <noreply@squintreview.com>',
    );
    expect(
      workspaceFromHeader({ fromEmailName: "ONE Creative", workspaceName: "ONE Agency" }, FROM),
    ).toBe('"ONE Creative via Squint" <noreply@squintreview.com>');
  });

  it("falls back to the workspace's name, then to plain Squint", () => {
    expect(workspaceFromHeader({ fromEmailName: " <@> ", workspaceName: "Acme" }, FROM)).toBe(
      '"Acme via Squint" <noreply@squintreview.com>',
    );
    expect(workspaceFromHeader({ fromEmailName: "", workspaceName: '"<>"' }, FROM)).toBe(
      '"Squint" <noreply@squintreview.com>',
    );
    expect(workspaceFromHeader({ fromEmailName: null, workspaceName: undefined }, FROM)).toBe(
      '"Squint" <noreply@squintreview.com>',
    );
  });

  it("is null without a usable EMAIL_FROM address", () => {
    const names = { fromEmailName: null, workspaceName: "Acme" };
    for (const from of [undefined, "", "Squint", "Squint <>", "a@b@c", "<a b@c>"]) {
      expect(workspaceFromHeader(names, from), String(from)).toBeNull();
    }
  });

  it("can't inject a header, a second address or a quote", () => {
    const header = workspaceFromHeader(
      {
        fromEmailName: 'Evil"\r\nBcc: victim@example.com\r\n<x@y> \\ `tick`',
        workspaceName: "Acme",
      },
      FROM,
    );
    expect(header).toBe(
      '"Evil Bcc: victim example.com x y tick via Squint" <noreply@squintreview.com>',
    );
    expect(header).not.toMatch(/[\r\n]/);
    expect(header?.match(/@/g)).toHaveLength(1);
    expect(header?.match(/"/g)).toHaveLength(2);
  });
});

describe("parts of the header", () => {
  it("reads the address from a named or bare EMAIL_FROM", () => {
    expect(parseFromAddress(FROM)).toBe("noreply@squintreview.com");
    expect(parseFromAddress("  noreply@squintreview.com ")).toBe("noreply@squintreview.com");
    expect(parseFromAddress('"Squint, Inc" <hi@squint.dev>')).toBe("hi@squint.dev");
  });

  it("keeps apostrophes and other punctuation, collapses spaces, and caps the length", () => {
    expect(cleanSenderName("  Dailen's   Studio, LLC (NYC)\t")).toBe("Dailen's Studio, LLC (NYC)");
    expect(cleanSenderName("\u0000\u0007Bell")).toBe("Bell");
    const long = cleanSenderName(`${"é".repeat(SENDER_NAME_MAX)}ABC`);
    expect(Array.from(long)).toHaveLength(SENDER_NAME_MAX);
    // Cut by character, so an emoji is never split into half a surrogate pair.
    const emoji = cleanSenderName("😀".repeat(SENDER_NAME_MAX + 5));
    expect(Array.from(emoji)).toEqual(Array(SENDER_NAME_MAX).fill("😀"));
  });
});

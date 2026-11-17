import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AVATAR_FILL, AVATAR_INK } from "@/lib/avatar/default-avatar";
import { CompanyCardPreview } from "./CompanyCardPreview";

const SVG_URI = /src="data:image\/svg\+xml;base64,([^"]+)"/;

/** The card for Harbor & Pine, and the company mark's SVG it draws (null with none). */
function card(color: string | null, logoUri: string | null = null) {
  const html = renderToStaticMarkup(
    createElement(CompanyCardPreview, {
      company: "Harbor & Pine",
      project: "Spring launch",
      line: [{ text: "invited you to review" }],
      color,
      logoUri,
    }),
  );
  const encoded = SVG_URI.exec(html)?.[1];
  return { html, mark: encoded ? Buffer.from(encoded, "base64").toString("utf8") : null };
}

/** The bubble's fill and the building's, in drawing order. */
function fills(svg: string): string[] {
  return [...svg.matchAll(/<path d="[^"]*" fill="([^"]+)"/g)].map((match) => match[1] ?? "");
}

describe("CompanyCardPreview's company mark", () => {
  it("draws the company's default mark in its frame without a logo, never its initials", () => {
    const { html, mark } = card(null);
    expect(html).not.toContain(">HP<");
    expect(mark).not.toBeNull();
    // The bubble's gray, the building in ink; nothing satori can't draw.
    expect(fills(mark ?? "").slice(0, 2)).toEqual([AVATAR_FILL, AVATAR_INK]);
    expect(mark).not.toMatch(/<text|var\(|filter|vector-effect|transform|style=/);
    // No background square: the frame's paper shows behind it.
    expect(mark).not.toContain('d="M0 0H100V100H0Z"');
    // Inside the 112px frame's 4px border.
    expect(html).toMatch(/<img src="data:image\/svg\+xml[^"]*" alt="" width="104" height="104"/);
  });

  it("stays gray whatever the brand color: the color rings the frame, never the mark", () => {
    expect(card("#0f766e").mark).toBe(card(null).mark);
  });

  it("shows the logo instead when the card can draw one", () => {
    const { html, mark } = card("#0f766e", "data:image/png;base64,AAAA");
    expect(mark).toBeNull();
    expect(html).toContain('src="data:image/png;base64,AAAA"');
  });
});

import { describe, expect, it } from "vitest";
import { pin } from "../../test/fixtures";
import { StorageLimitError } from "../storage";
import { decodePinComment, encodePinComment } from "./codec";
import { escapeMarkdown, linkTarget } from "./markdown";

describe("pin comment codec", () => {
  it("round-trips a pin", () => {
    const original = pin({
      priority: "must",
      screenshotUrl: "https://github.com/o/r/blob/pinpoint-assets/feature-x/pin-1.png?raw=true",
      replies: [{ id: "r1", author: "Bo", body: "Done", createdAt: "2026-10-23T11:00:00.000Z" }],
    });
    expect(decodePinComment(encodePinComment(original))).toEqual(original);
  });

  it("puts the hidden block first and renders a readable body", () => {
    const body = encodePinComment(pin({ screenshotUrl: "https://example.com/a.png" }));
    expect(body.startsWith("<!-- pinpoint:")).toBe(true);
    expect(body).toContain("### Pinpoint comment · `should`");
    expect(body).toContain("> Make the CTA larger");
    expect(body).toContain("[Open on preview](https://feature-x.preview.app/pricing?pin=pin-1)");
    expect(body).toContain("![Screenshot of the page](https://example.com/a.png)");
  });

  it("marks resolved pins with a check prefix", () => {
    const body = encodePinComment(
      pin({ resolved: true, resolvedBy: "Bo", resolvedAt: "2026-10-24T09:00:00.000Z" }),
    );
    expect(body).toContain("### ✅ Pinpoint comment");
    expect(body).toContain("Resolved by Bo on 2026-10-24");
  });

  it("survives --> and HTML comment syntax inside user text", () => {
    const hostile = pin({
      body: 'first --> <!-- pinpoint:{"v":1} --> end',
      author: "Eve -->",
      replies: [{ id: "r1", author: "x", body: "--!> -->", createdAt: "2026-10-23T11:00:00.000Z" }],
    });
    const body = encodePinComment(hostile);
    const hiddenBlock = body.slice(0, body.indexOf(" -->") + 4);
    expect(hiddenBlock).not.toMatch(/-->.*-->/s);
    expect(body.match(/<!--/g)).toHaveLength(1);
    expect(decodePinComment(body)).toEqual(hostile);
  });

  it("escapes markdown and HTML injection in names and bodies", () => {
    const body = encodePinComment(
      pin({
        author: "**Admin** [click](https://evil.example) @octocat",
        body: "<img src=x onerror=alert(1)>\n# Heading\n![x](https://evil.example/t.png)",
      }),
    );
    const visible = body.slice(body.indexOf(" -->") + 4);
    expect(visible).not.toContain("<img");
    expect(visible).not.toContain("**Admin**");
    expect(visible).not.toContain("[click](");
    expect(visible).not.toContain("![x](");
    expect(visible).not.toMatch(/@octocat/);
    expect(visible).toContain("&lt;img");
    expect(visible).toContain("> \\# Heading");
  });

  it("ignores fake blocks that are not at the very start", () => {
    const forged = `Nice work!\n\n${encodePinComment(pin())}`;
    expect(decodePinComment(forged)).toBeNull();
  });

  it("returns null for malformed or schema-invalid payloads", () => {
    expect(decodePinComment("just a normal comment")).toBeNull();
    expect(decodePinComment("<!-- pinpoint:{not json} -->")).toBeNull();
    expect(decodePinComment('<!-- pinpoint:{"v":1,"pin":{"id":"x"}} -->')).toBeNull();
    expect(decodePinComment('<!-- pinpoint:{"v":2,"pin":{}} -->')).toBeNull();
  });

  it("refuses to exceed GitHub's comment length limit", () => {
    const reply = {
      id: "r",
      author: "Bo",
      body: "@".repeat(5000),
      createdAt: "2026-10-23T11:00:00.000Z",
    };
    const huge = pin({ replies: Array.from({ length: 4 }, (_, i) => ({ ...reply, id: `r${i}` })) });
    expect(() => encodePinComment(huge)).toThrow(StorageLimitError);
  });
});

describe("markdown helpers", () => {
  it("escapes markdown control characters", () => {
    expect(escapeMarkdown("*a* _b_ `c` [d](e) #f")).toBe(
      "\\*a\\* \\_b\\_ \\`c\\` \\[d\\]\\(e\\) \\#f",
    );
  });

  it("only links http(s) URLs and encodes characters that would break the link", () => {
    expect(linkTarget("javascript:alert(1)")).toBeNull();
    expect(linkTarget("https://x.app/a(b) c")).toBe("https://x.app/a%28b%29%20c");
  });
});

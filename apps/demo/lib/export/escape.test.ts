import { describe, expect, it } from "vitest";
import { fencedText, inlineCode, inlineText } from "./escape";

describe("inlineText", () => {
  it("escapes markup and keeps everything on one line", () => {
    expect(inlineText("Mia **[admin]**\n# x <b>&")).toBe(
      "Mia \\*\\*\\[admin\\]\\*\\* \\# x \\<b\\>\\&",
    );
  });
});

describe("inlineCode", () => {
  it("uses a fence longer than any backtick run inside", () => {
    expect(inlineCode("https://a.example/?q=1")).toBe("`https://a.example/?q=1`");
    expect(inlineCode("a``b")).toBe("```a``b```");
    expect(inlineCode("`edge`")).toBe("`` `edge` ``");
  });
});

describe("fencedText", () => {
  it("keeps text verbatim inside a fence no line can close", () => {
    expect(fencedText("plain")).toBe("```text\nplain\n```");
    const tricky = "```\n# heading\n````";
    expect(fencedText(tricky)).toBe(`\`\`\`\`\`text\n${tricky}\n\`\`\`\`\``);
    expect(fencedText("a\r\nb")).toBe("```text\na\nb\n```");
  });
});

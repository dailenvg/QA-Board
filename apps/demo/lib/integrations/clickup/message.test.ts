import { describe, expect, it } from "vitest";
import {
  cleanNote,
  clickUpMessage,
  escapeMarkdown,
  messageProjectName,
  noteLength,
  noteParagraphs,
} from "./message";

const URL = "https://squint.test/p/p-1";

describe("escapeMarkdown", () => {
  it("makes every punctuation mark literal, and leaves letters, digits and spaces", () => {
    expect(escapeMarkdown("[x](https://evil.test) @here *bold* #1 <b>")).toBe(
      "\\[x\\]\\(https\\:\\/\\/evil\\.test\\) \\@here \\*bold\\* \\#1 \\<b\\>",
    );
    expect(escapeMarkdown("Café 2026 ✓")).toBe("Café 2026 ✓");
    expect(escapeMarkdown("a\\b`c`_d_~e~|f!g")).toBe("a\\\\b\\`c\\`\\_d\\_\\~e\\~\\|f\\!g");
  });
});

describe("cleanNote", () => {
  it("keeps line breaks, collapses spaces, trims, and allows one blank line in a row", () => {
    expect(cleanNote("  First line  \r\n   second\t\tline\n\n\n\nLast one ")).toBe(
      "First line\nsecond line\n\nLast\none",
    );
  });

  it("drops the characters that hide or flip text, and turns other controls into spaces", () => {
    expect(cleanNote("a‮b​c\u0007d")).toBe("abc d");
  });

  it("counts characters, not UTF-16 units", () => {
    expect(noteLength(" 👍👍 ")).toBe(2);
  });
});

describe("noteParagraphs", () => {
  it("splits a note into paragraphs of lines, and nothing for a blank note", () => {
    expect(noteParagraphs("One\ntwo\n\nThree")).toEqual([["One", "two"], ["Three"]]);
    expect(noteParagraphs(" \n ")).toEqual([]);
  });
});

describe("messageProjectName", () => {
  it("keeps the name on one line, with nothing hidden or flipped, and trimmed", () => {
    expect(messageProjectName("  Line one\n\n    code\r\nthree\u2028four ")).toBe(
      "Line one code three four",
    );
    expect(messageProjectName("Home\u202Eegap\u200B\tv2\u0007")).toBe("Homeegap v2");
  });

  it("names a project whose name is blank once cleaned", () => {
    expect(messageProjectName(" \n\u200B\uFEFF ")).toBe("Untitled project");
  });
});

describe("clickUpMessage", () => {
  it("puts the name in bold, its page's address on a line of its own, the note, then where it came from", () => {
    expect(
      clickUpMessage({
        projectName: "Home page",
        projectUrl: URL,
        note: "Please check\nthe hero.\n\nThanks!",
      }),
    ).toBe(
      [
        "**Home page**",
        URL,
        "Please check\\\nthe hero\\.",
        "Thanks\\!",
        "_Sent for review from Squint_",
      ].join("\n\n"),
    );
  });

  it("leaves out a blank note", () => {
    expect(clickUpMessage({ projectName: "Home", projectUrl: URL, note: "  \n " })).toBe(
      `**Home**\n\n${URL}\n\n_Sent for review from Squint_`,
    );
  });

  it("can't be given a link, a mention, a heading or a list by the name or the note", () => {
    const message = clickUpMessage({
      projectName: "x](https://evil.test) [y",
      projectUrl: URL,
      note: "# Heading\n- item\n1. first\n> quote\n    code\n@everyone [click](https://evil.test) <https://evil.test>",
    });
    const [title, address, note] = message.split("\n\n");
    expect(title).toBe("**x\\]\\(https\\:\\/\\/evil\\.test\\) \\[y**");
    expect(address).toBe(URL);
    expect(note).toBe(
      [
        "\\# Heading",
        "\\- item",
        "1\\. first",
        "\\> quote",
        "code",
        "\\@everyone \\[click\\]\\(https\\:\\/\\/evil\\.test\\) \\<https\\:\\/\\/evil\\.test\\>",
      ].join("\\\n"),
    );
    // The one address left unescaped is the project's own.
    expect(message.match(/https:\/\//g)).toEqual(["https://"]);
  });

  it("keeps the name on one line, whatever it holds", () => {
    const [title, ...rest] = clickUpMessage({
      projectName: "Line one\n\n    code\u2029\u202Eend",
      projectUrl: URL,
      note: "",
    }).split("\n\n");
    expect(title).toBe("**Line one code end**");
    expect(rest).toEqual([URL, "_Sent for review from Squint_"]);
    expect(clickUpMessage({ projectName: "\n \u200B", projectUrl: URL, note: "" })).toMatch(
      /^\*\*Untitled project\*\*/,
    );
  });

  it("encodes what would cut the address short or format part of it", () => {
    expect(
      clickUpMessage({
        projectName: "P",
        projectUrl: "https://squint.test/p/a(b)_c_*d*",
        note: "",
      }),
    ).toContain("\n\nhttps://squint.test/p/a%28b%29%5Fc%5F%2Ad%2A\n\n");
  });
});

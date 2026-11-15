import { describe, expect, it } from "vitest";
import {
  cleanNote,
  clickUpMessage,
  escapeMarkdown,
  messageProjectName,
  noteLength,
  noteParagraphs,
  sentBy,
} from "./message";

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
  it("says who sent it in bold, then the note, with no project name, link or footer", () => {
    expect(clickUpMessage({ sender: "Ana Ruiz", note: "Please check\nthe hero.\n\nThanks!" })).toBe(
      [
        "**Ana Ruiz sent you this project to review it through Squint**",
        "Please check\\\nthe hero\\.",
        "Thanks\\!",
      ].join("\n\n"),
    );
  });

  it("leaves out a blank note, so there's no empty paragraph", () => {
    expect(clickUpMessage({ sender: "Ana Ruiz", note: "  \n " })).toBe(
      "**Ana Ruiz sent you this project to review it through Squint**",
    );
  });

  it("can't be given a link, a mention, a heading or a list by the sender's name or the note", () => {
    const message = clickUpMessage({
      sender: "x](https://evil.test) [y",
      note: "# Heading\n- item\n1. first\n> quote\n    code\n@everyone [click](https://evil.test) <https://evil.test>",
    });
    const [title, note] = message.split("\n\n");
    expect(title).toBe(
      "**x\\]\\(https\\:\\/\\/evil\\.test\\) \\[y sent you this project to review it through Squint**",
    );
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
    expect(message).not.toMatch(/https:\/\//);
  });

  it("names the sender by their email when that's what Squint has, made literal", () => {
    expect(clickUpMessage({ sender: "ana@acme.test", note: "" })).toBe(
      "**ana\\@acme\\.test sent you this project to review it through Squint**",
    );
  });
});

describe("sentBy", () => {
  it("is the message's first line, the sender's name on one line with nothing hidden", () => {
    expect(sentBy("  Ana\n\u202ERuiz ")).toBe(
      "Ana Ruiz sent you this project to review it through Squint",
    );
  });

  it("names someone on the team when there's no name left", () => {
    expect(sentBy("\n \u200B")).toBe(
      "Someone on your team sent you this project to review it through Squint",
    );
  });
});

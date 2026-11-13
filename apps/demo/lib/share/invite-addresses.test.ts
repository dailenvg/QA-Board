import { describe, expect, it } from "vitest";
import {
  isInviteAddress,
  normalizeAddress,
  prepareInvitees,
  splitAddresses,
} from "./invite-addresses";

describe("invite addresses", () => {
  it("are compared trimmed and lowercased", () => {
    expect(normalizeAddress("  Ana@Acme.Studio ")).toBe("ana@acme.studio");
  });

  it.each([
    "ana@acme.studio",
    "ana.lopez+review@mail.acme.co.uk",
    "o'brien@acme.ie",
    "josé@acmé.es",
  ])("take %s", (address) => {
    expect(isInviteAddress(address)).toBe(true);
  });

  it.each([
    "ana",
    "ana@",
    "@acme.studio",
    "ana@acme",
    "ana@@acme.studio",
    "ana lopez@acme.studio",
    "Ana <ana@acme.studio>",
    "ana@acme.studio,leo@acme.studio",
    "ana@acme..studio",
    `${"a".repeat(65)}@acme.studio`,
    `ana@${"a".repeat(250)}.studio`,
  ])("refuse %s", (address) => {
    expect(isInviteAddress(address)).toBe(false);
  });

  it("split pasted text at commas, semicolons, spaces and lines", () => {
    expect(splitAddresses("Ana@acme.studio, leo@acme.studio;\nmia@acme.studio  kai@x.io")).toEqual([
      "ana@acme.studio",
      "leo@acme.studio",
      "mia@acme.studio",
      "kai@x.io",
    ]);
    expect(splitAddresses(" , ;\n")).toEqual([]);
  });

  it("sort a list into deduped addresses and what isn't one", () => {
    expect(
      prepareInvitees([
        "Ana@Acme.studio",
        "ana@acme.studio ",
        " nope ",
        "",
        "leo@acme.studio",
        "nope",
      ]),
    ).toEqual({ addresses: ["ana@acme.studio", "leo@acme.studio"], invalid: ["nope"] });
  });
});

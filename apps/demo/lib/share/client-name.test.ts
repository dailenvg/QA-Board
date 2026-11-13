import { describe, expect, it } from "vitest";
import { CLIENT_NAME_MAX, clientNameError, cleanClientName, storedClientName } from "./client-name";

describe("client names", () => {
  it("trim, collapse spaces and keep punctuation as typed", () => {
    expect(cleanClientName("  Acme   Studio ")).toBe("Acme Studio");
    expect(cleanClientName(`O'Brien & "Sons" <Ltd>`)).toBe(`O'Brien & "Sons" <Ltd>`);
  });

  it("drop control characters and line breaks, so a name stays on one line", () => {
    expect(cleanClientName("Acme\r\nStudio Ltd\u0000\u0007")).toBe("Acme Studio Ltd");
    expect(cleanClientName("Acme\tStudio ")).toBe("Acme Studio");
  });

  it("store nothing for a blank name", () => {
    expect(storedClientName("  \n ")).toBeNull();
    expect(storedClientName(null)).toBeNull();
    expect(storedClientName(" Acme ")).toBe("Acme");
  });

  it("refuse more than 80 characters once cleaned, counting emoji as one", () => {
    expect(clientNameError("a".repeat(CLIENT_NAME_MAX))).toBeNull();
    expect(clientNameError(`  ${"a".repeat(CLIENT_NAME_MAX)}  `)).toBeNull();
    expect(clientNameError("🎨".repeat(CLIENT_NAME_MAX))).toBeNull();
    expect(clientNameError("a".repeat(CLIENT_NAME_MAX + 1))).toBe("Use at most 80 characters.");
  });
});

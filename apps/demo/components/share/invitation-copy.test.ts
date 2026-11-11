import { describe, expect, it } from "vitest";
import { invitationLine } from "./invitation-copy";

describe("invitationLine", () => {
  it("names the company and the project, then says how to start", () => {
    expect(invitationLine("ONE Agency", "Spring launch")).toBe(
      "ONE Agency has invited you to review Spring launch. Choose Comment (or press C), then click or tap anywhere to leave feedback.",
    );
  });
});

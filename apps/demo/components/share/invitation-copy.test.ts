import { describe, expect, it } from "vitest";
import { invitationLine, invitedToReview } from "./invitation-copy";

describe("invitedToReview", () => {
  it("names the company and the project", () => {
    expect(invitedToReview("ONE Agency", "Spring launch")).toBe(
      "ONE Agency has invited you to review Spring launch",
    );
  });

  it("names the project alone on a link without a company", () => {
    expect(invitedToReview(null, "Spring launch")).toBe(
      "You've been invited to review Spring launch",
    );
  });
});

describe("invitationLine", () => {
  it("names the company and the project, then says how to start", () => {
    expect(invitationLine("ONE Agency", "Spring launch")).toBe(
      "ONE Agency has invited you to review Spring launch. Choose Comment (or press C), then click or tap anywhere to leave feedback.",
    );
  });
});

import { describe, expect, it } from "vitest";
import { invitationLine, invitedToReview, lockedHeading } from "./invitation-copy";

describe("invitedToReview", () => {
  it("names the company and the project", () => {
    expect(invitedToReview("ONE Agency", "Spring launch")).toBe(
      "ONE Agency has invited you to review Spring launch",
    );
  });

  it("names the client the link is for", () => {
    expect(invitedToReview("ONE Agency", "Spring launch", "Acme Studio")).toBe(
      "ONE Agency has invited Acme Studio to review Spring launch",
    );
  });

  it("names the project alone on a link without a company", () => {
    expect(invitedToReview(null, "Spring launch", "Acme Studio")).toBe(
      "You've been invited to review Spring launch",
    );
  });
});

describe("lockedHeading", () => {
  it("leaves the company to the brand row above it", () => {
    expect(lockedHeading("ONE Agency", "Spring launch")).toBe(
      "invited you to review Spring launch",
    );
    expect(lockedHeading("ONE Agency", "Spring launch", "Acme Studio")).toBe(
      "invited Acme Studio to review Spring launch",
    );
  });

  it("keeps the whole sentence on a link without a company", () => {
    expect(lockedHeading(null, "Spring launch")).toBe(
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

  it("names the client when the link has one", () => {
    expect(invitationLine("ONE Agency", "Spring launch", "Acme Studio")).toMatch(
      /^ONE Agency has invited Acme Studio to review Spring launch\. /,
    );
  });
});

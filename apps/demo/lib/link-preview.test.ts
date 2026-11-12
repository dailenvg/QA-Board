import { describe, expect, it } from "vitest";
import {
  INVITATION_CARD_ALT,
  invitationPreview,
  previewMetadata,
  SHARED_REVIEW_PREVIEW,
} from "./link-preview";

describe("a review link's preview", () => {
  it("names the company and the project on a workspace's link", () => {
    const copy = invitationPreview({ company: "ONE Agency", project: "Spring launch" });
    expect(copy.title).toBe("ONE Agency invited you to review Spring launch");
    expect(copy.description).toBe(
      "Open the link, drop a pin and leave ONE Agency a comment. No account needed.",
    );
    // The card's alt is the same for every link (see INVITATION_CARD_ALT).
    expect(copy.alt).toBe(INVITATION_CARD_ALT);
    expect(INVITATION_CARD_ALT).toBe(
      "An invitation to review, naming the company. Squiggy, the blue Squint mascot, leans in among comment pins.",
    );
    expect(previewMetadata(copy)).toMatchObject({
      openGraph: { title: copy.title, description: copy.description, siteName: "Squint" },
      twitter: { card: "summary_large_image", title: copy.title, description: copy.description },
    });
  });

  it("names the company only on a password-protected link", () => {
    const copy = invitationPreview({ company: "ONE Agency", project: null });
    expect(copy.title).toBe("ONE Agency invited you to review");
    expect(copy.description).toBe(
      "Open the link, drop a pin and leave ONE Agency a comment. No account needed.",
    );
    // Its card leaves the project out, so the alt never claims one.
    expect(copy.alt).toBe(INVITATION_CARD_ALT);
    expect(copy.alt).not.toMatch(/project/i);
  });

  it("stays generic on an anonymous link", () => {
    expect(SHARED_REVIEW_PREVIEW.title).toBe("You're invited to review");
    expect(SHARED_REVIEW_PREVIEW.description).toBe(
      "Open the link, drop a pin and leave a comment. No account needed.",
    );
  });
});

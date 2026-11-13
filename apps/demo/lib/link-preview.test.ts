import { describe, expect, it } from "vitest";
import {
  INVITATION_CARD_ALT,
  invitationPreview,
  previewMetadata,
  SHARED_REVIEW_PREVIEW,
} from "./link-preview";

describe("a review link's preview", () => {
  it("names the company and the project on a workspace's link", () => {
    const copy = invitationPreview({
      company: "ONE Agency",
      project: "Spring launch",
      client: null,
    });
    expect(copy.title).toBe("ONE Agency invited you to review Spring launch");
    expect(copy.description).toBe(
      "Open the link, drop a pin and leave ONE Agency a comment. No account needed.",
    );
    // The card's alt is the same for every link (see INVITATION_CARD_ALT).
    expect(copy.alt).toBe(INVITATION_CARD_ALT);
    expect(INVITATION_CARD_ALT).toBe(
      "An invitation to review, naming the company, the project and, when the link has one, the client. Squiggy, the blue Squint mascot, leans in among comment pins.",
    );
    expect(previewMetadata(copy)).toMatchObject({
      openGraph: { title: copy.title, description: copy.description, siteName: "Squint" },
      twitter: { card: "summary_large_image", title: copy.title, description: copy.description },
    });
  });

  it("names the client a workspace's link is for", () => {
    const copy = invitationPreview({
      company: "ONE Agency",
      project: "Spring launch",
      client: "Acme Studio",
    });
    expect(copy.title).toBe("ONE Agency invited Acme Studio to review Spring launch");
  });

  it("stays generic on an anonymous link", () => {
    expect(SHARED_REVIEW_PREVIEW.title).toBe("You're invited to review");
    expect(SHARED_REVIEW_PREVIEW.description).toBe(
      "Open the link, drop a pin and leave a comment. No account needed.",
    );
  });
});

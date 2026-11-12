import { describe, expect, it } from "vitest";
import { reviewerStories } from "./reviewer-stories";

const lastTitle = (hours: number | null) => reviewerStories(hours).at(-1)?.title;

describe("reviewer stories", () => {
  it("name the link's own review window in the last step", () => {
    expect(lastTitle(24)).toBe("Send feedback within 24 hours");
    expect(lastTitle(72)).toBe("Send feedback within 72 hours");
    expect(lastTitle(168)).toBe("Send feedback within 7 days");
  });

  it("promise no deadline on a link without one", () => {
    const last = reviewerStories(null).at(-1);
    expect(last?.title).toBe("Send feedback when you're ready");
    expect(last?.body).not.toMatch(/countdown/i);
  });
});

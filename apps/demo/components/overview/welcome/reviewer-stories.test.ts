import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { reviewerStories } from "./reviewer-stories";
import { storyTimeLeft } from "./story-script";

const last = (hours: number | null) => reviewerStories(hours).at(-1);
const lastTitle = (hours: number | null) => last(hours)?.title;

/** The last story's scene, as its finished frame. */
function lastScene(hours: number | null): string {
  const Scene = last(hours)?.Scene;
  if (!Scene) throw new Error("no scene");
  return renderToStaticMarkup(createElement(Scene, { beat: 0, playing: false, still: true }));
}

describe("reviewer stories", () => {
  it("name the link's own review window in the last step", () => {
    expect(lastTitle(24)).toBe("Send feedback within 24 hours");
    expect(lastTitle(72)).toBe("Send feedback within 72 hours");
    expect(lastTitle(168)).toBe("Send feedback within 7 days");
  });

  it("promise no deadline on a link without one", () => {
    const story = last(null);
    expect(story?.title).toBe("Send feedback when you're ready");
    expect(story?.body).not.toMatch(/countdown/i);
  });

  it("count down within the link's own window, like the guest's chip", () => {
    expect(storyTimeLeft(24)).toBe("23h 12m left");
    expect(storyTimeLeft(72)).toBe("2d 23h 12m left");
    expect(storyTimeLeft(168)).toBe("6d 23h 12m left");
    expect(lastScene(24)).toContain("23h 12m left");
    expect(lastScene(24)).not.toContain("2d");
    expect(lastScene(168)).toContain("6d 23h 12m left");
    expect(lastScene(null)).not.toMatch(/\d+m left/);
  });
});

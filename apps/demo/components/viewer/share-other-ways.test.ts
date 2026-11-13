import { describe, expect, it } from "vitest";
import { APP_URLS, copiedMessage, smsHref } from "./share-other-ways";

describe("sending a link another way", () => {
  it("fills a Messages link with the whole message, encoded", () => {
    expect(smsHref("Hi Ana & Leo,\n\nOpen: https://squint.test/s/a?b=c")).toBe(
      "sms:?&body=Hi%20Ana%20%26%20Leo%2C%0A%0AOpen%3A%20https%3A%2F%2Fsquint.test%2Fs%2Fa%3Fb%3Dc",
    );
  });

  it("opens Slack and ClickUp on the web", () => {
    expect(APP_URLS).toEqual({
      clickup: "https://app.clickup.com",
      slack: "https://app.slack.com/client",
    });
  });

  it("says what was copied, and where to paste it", () => {
    expect(copiedMessage("slack")).toBe("Message copied. Paste it in Slack.");
    expect(copiedMessage("clickup")).toBe("Message copied. Paste it in ClickUp.");
    expect(copiedMessage("messages")).toBe("Message copied. Paste it in Messages.");
    expect(copiedMessage("link")).toBe("Link copied.");
  });
});

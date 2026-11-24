import { describe, expect, it } from "vitest";
import type { Reply } from "@/lib/store/types";
import { threadSummary } from "./thread-summary";

const MINUTE = 60_000;
const NOW = 60 * MINUTE;

const reply = (id: string, author: string, createdAt: number): Reply => ({
  id,
  projectId: "p-1",
  commentId: "c-1",
  body: "Sure.",
  author,
  createdAt,
});

describe("threadSummary", () => {
  it("is null without replies", () => {
    expect(threadSummary([], NOW)).toBeNull();
  });

  it("counts one reply in the singular, and names its author and time", () => {
    expect(threadSummary([reply("r-1", "Ben", NOW - 5 * MINUTE)], NOW)).toEqual({
      count: "1 reply",
      author: "Ben",
      when: "5 minutes ago",
      at: NOW - 5 * MINUTE,
    });
  });

  it("counts several, and names the latest, the last of the oldest-first thread", () => {
    const summary = threadSummary(
      [reply("r-1", "Ben", NOW - 30 * MINUTE), reply("r-2", "Cleo", NOW - 2 * MINUTE)],
      NOW,
    );
    expect(summary).toMatchObject({ count: "2 replies", author: "Cleo", when: "2 minutes ago" });
  });

  it("never says a time to come when this clock is behind the server's", () => {
    expect(threadSummary([reply("r-1", "Ben", NOW + 2 * MINUTE)], NOW)?.when).toBe("just now");
  });
});

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
      teamOnly: 0,
      spoken: "1 reply",
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

  it("counts the replies kept to the team under a comment clients see (U20)", () => {
    const hidden = (id: string): Reply => ({ ...reply(id, "Ben", NOW), teamOnly: true });
    const shown = reply("r-1", "Cleo", NOW);
    expect(threadSummary([shown, hidden("r-2"), shown], NOW)).toMatchObject({
      count: "3 replies",
      teamOnly: 1,
      spoken: "3 replies, 1 of them team only",
    });
    expect(threadSummary([hidden("r-1"), hidden("r-2")], NOW)?.spoken).toBe(
      "2 replies, all team only",
    );
    expect(threadSummary([hidden("r-1")], NOW)?.spoken).toBe("1 reply, team only");
    // Under a team-only comment its chip covers the thread: no count of its own.
    expect(threadSummary([hidden("r-1")], NOW, true)).toMatchObject({
      teamOnly: 0,
      spoken: "1 reply",
    });
  });

  it("never says a time to come when this clock is behind the server's", () => {
    expect(threadSummary([reply("r-1", "Ben", NOW + 2 * MINUTE)], NOW)?.when).toBe("just now");
  });
});

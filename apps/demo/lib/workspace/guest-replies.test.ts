import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as DatabaseModule from "@/lib/db/database";
import { REPLY, REPLY_CAPS, STATE } from "@/test/share-fixture";
import {
  addFolder,
  NOW,
  TEST_AUTH_SECRET,
  twoWorkspaces,
  URL_PROJECT,
  type Seat,
} from "@/test/workspace-fixture";
import { call } from "@/test/workspace-routes";
import type { Database } from "../db/database";
import { inlineBackend } from "../share/blob-backend";
import { createPostgresStore } from "../share/postgres-store";
import { createShare } from "../share/service";
import type { ShareStore } from "../share/store";
import type { Reply } from "../store/types";
import { createProject } from "./projects";
import { listReplies } from "./replies";
import { attachShare } from "./share-links";

/**
 * A guest's reply pulled from the review link (4.2): the workspace
 * saves it as a client's only when a guest really posted it on that link,
 * under that comment, and takes what it says from the link, never the browser.
 */

const holder = vi.hoisted(() => ({ db: null as Database | null }));

vi.mock("@/lib/db/database", async (importOriginal) => ({
  ...(await importOriginal<typeof DatabaseModule>()),
  database: () => (holder.db ? Promise.resolve(holder.db) : null),
}));

/** The browser the guest replied from, as the review link recorded it. */
const GUEST_INFO = {
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) Version/18.1 Safari/604.1",
  viewport: { width: 390, height: 844 },
  dpr: 3,
};
/** The guest's reply as the link holds it. */
const GUEST = { id: "k-1", commentId: "c-1", body: "Thanks!", author: "Cleo", createdAt: NOW - 5 };

let db: Database;
let a: Seat;
let store: ShareStore;
let shareId: string;

const repliesPath = (projectId: string, commentId: string) =>
  `/api/w/${a.workspaceId}/projects/${projectId}/comments/${commentId}/replies`;

/** What a member's browser sends for a pulled reply: its id, and words the server must ignore. */
interface SaveInit {
  projectId?: string;
  commentId?: string;
  fromShare?: unknown;
}

function save(
  id: string,
  { projectId = "p1", commentId = "c-1", fromShare = true }: SaveInit = {},
) {
  return call("POST", repliesPath(projectId, commentId), {
    cookie: a.cookie,
    body: {
      id,
      body: "Words the guest never wrote",
      author: "Someone Else",
      createdAt: NOW - 1_000_000,
      editedAt: NOW,
      clientInfo: { userAgent: "Forged", viewport: { width: 1, height: 1 } },
      fromShare,
    },
  });
}

const saved = async (): Promise<Reply[]> => listReplies(db, a.workspaceId, "p1", a.userId);

/**
 * Projects p1 (shared: its link has comment c-1 with the team's reply r-1 and
 * the guest's k-1) and p2 (not shared), each with comments c-1 and c-2.
 */
beforeEach(async () => {
  vi.stubEnv("AUTH_SECRET", TEST_AUTH_SECRET);
  ({ db, a } = await twoWorkspaces());
  holder.db = db;
  await addFolder(db, a.workspaceId);
  for (const projectId of ["p1", "p2"]) {
    await createProject(db, a.workspaceId, URL_PROJECT(projectId), NOW);
    for (const id of ["c-1", "c-2"]) {
      const posted = await call("POST", `/api/w/${a.workspaceId}/projects/${projectId}/comments`, {
        cookie: a.cookie,
        body: { id, x: 1, y: 1, body: "Bigger logo", author: "Dailen" },
      });
      expect(posted.status).toBe(201);
    }
  }
  store = createPostgresStore(db);
  const state = { ...STATE, replies: [REPLY] };
  const created = await createShare({ store, blobs: inlineBackend }, state, NOW);
  shareId = created.shareId;
  const { token, ownerKey } = created;
  await db.transaction((tx) =>
    attachShare(tx, a.workspaceId, "p1", { shareId, token, ownerKey }, NOW, TEST_AUTH_SECRET),
  );
  expect(await store.addClientReply(shareId, GUEST, REPLY_CAPS, GUEST_INFO)).toBe("added");
});

describe("saving a guest's reply pulled from a review link", () => {
  it("stores it without an author account, as the link holds it, whatever the body says", async () => {
    const response = await save("k-1");
    expect(response.status).toBe(201);
    const expected = {
      id: "k-1",
      projectId: "p1",
      commentId: "c-1",
      body: "Thanks!",
      author: "Cleo",
      createdAt: GUEST.createdAt,
      clientInfo: GUEST_INFO,
      fromClient: true,
    };
    expect(await response.json()).toEqual(expected);
    expect(await saved()).toEqual([expected]);
    const { rows } = await db.query<{ author_user_id: string | null; origin: string }>(
      "SELECT author_user_id, origin FROM comment_replies WHERE id = 'k-1'",
    );
    expect(rows).toEqual([{ author_user_id: null, origin: "client" }]);
  });

  it("answers 409 for one saved already, as another tab's pull may have", async () => {
    expect((await save("k-1")).status).toBe(201);
    expect((await save("k-1")).status).toBe(409);
    expect(await saved()).toHaveLength(1);
  });

  it("refuses anything a guest didn't post on that project's link, under that comment", async () => {
    // Not on the link, the team's own reply on it, under another comment, and another project.
    const refused = [
      await save("made-up"),
      await save(REPLY.id),
      await save("k-1", { commentId: "c-2" }),
      await save("k-1", { projectId: "p2" }),
    ];
    expect(refused.map((response) => response.status)).toEqual([404, 404, 404, 404]);
    expect(await saved()).toEqual([]);
    expect(await listReplies(db, a.workspaceId, "p2")).toEqual([]);
  });

  it("only takes `true`", async () => {
    expect((await save("k-1", { fromShare: "yes" })).status).toBe(400);
    expect(await saved()).toEqual([]);
  });
});

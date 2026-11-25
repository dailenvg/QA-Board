import { describe, expect, it } from "vitest";
import { migratedPglite } from "@/test/pglite";
import { STATE } from "@/test/share-fixture";
import { toShareState } from "../share-client/share-state";
import type { Comment, Project, Reply } from "../store/types";
import { inlineBackend } from "./blob-backend";
import { createPostgresStore } from "./postgres-store";
import { changeSchema } from "./schemas";
import { applyChanges, clientView, createShare, ownerShare } from "./service";

/**
 * A reply's browser details (054) are the team's alone: never in what the
 * owner pushes, never in a link's stored reply, never in a guest's view.
 */

const TEAM_AGENT = "Mozilla/5.0 (Team browser)";
const GUEST_AGENT = "Mozilla/5.0 (Guest browser)";
const info = (userAgent: string) => ({
  userAgent,
  viewport: { width: 1440, height: 900 },
  dpr: 2,
  platform: { name: "macOS", version: "15.1" },
});

const project: Project = {
  id: "p1",
  folderId: "f1",
  name: "Acme",
  source: { kind: "url", url: "https://acme.example/" },
  createdAt: 0,
  updatedAt: 0,
};

const comment: Comment = {
  id: "c-1",
  projectId: "p1",
  x: 1,
  y: 1,
  body: "Bigger logo",
  author: "Ana",
  status: "active",
  createdAt: 1,
  updatedAt: 1,
  clientInfo: info(TEAM_AGENT),
};

const teamReply: Reply = {
  id: "r-team",
  projectId: "p1",
  commentId: "c-1",
  body: "On it.",
  author: "Ana",
  createdAt: 2,
  mine: true,
  clientInfo: info(TEAM_AGENT),
};

/** A pulled client reply the owner pushes back, its browser details read from the link. */
const pulledReply: Reply = {
  ...teamReply,
  id: "r-pulled",
  author: "Cleo",
  mine: undefined,
  fromClient: true,
  clientInfo: info(GUEST_AGENT),
};

describe("a reply's browser details", () => {
  it("never leave the workspace in a push, never sit in a link's reply, never reach a guest", async () => {
    const pushed = toShareState(project, [comment], [], [teamReply, pulledReply]);
    expect(JSON.stringify(pushed)).not.toMatch(/clientInfo|Mozilla|viewport|platform/);

    const db = await migratedPglite();
    const services = { store: createPostgresStore(db), blobs: inlineBackend };
    const created = await createShare(services, { ...STATE, comments: pushed.comments }, 100);
    const share = await ownerShare(services.store, created.shareId, created.ownerKey, 100);
    if (!share) throw new Error("no share");
    // An older or tampered browser slipping them into the push: the route's schema drops them.
    const planted = pushed.replies.map((reply, index) => ({
      ...reply,
      clientInfo: index === 0 ? teamReply.clientInfo : pulledReply.clientInfo,
    }));
    const change = changeSchema.parse({ replies: planted, cursor: 0 });
    expect((await applyChanges(services, share, change, 200)).ok).toBe(true);
    // A guest's own reply, kept beside its browser details for the owner's pull.
    const guest = { id: "r-guest", commentId: "c-1", body: "Thanks", author: "Cleo", createdAt: 3 };
    expect(await services.store.insertReply(share.id, guest, "client", info(GUEST_AGENT))).toBe(
      true,
    );

    const { rows } = await db.query<{ id: string; data: unknown; client_info: unknown }>(
      "SELECT id, data, client_info FROM squint_share_replies ORDER BY seq",
    );
    expect(rows.map((row) => row.id)).toEqual(["r-team", "r-pulled", "r-guest"]);
    expect(JSON.stringify(rows.map((row) => row.data))).not.toMatch(
      /clientInfo|Mozilla|viewport|platform/,
    );
    expect(rows.map((row) => row.client_info)).toEqual([null, null, info(GUEST_AGENT)]);

    const view = await clientView(services.store, share, created.token);
    expect(view.replies.map((reply) => reply.id)).toEqual(["r-team", "r-pulled", "r-guest"]);
    expect(JSON.stringify(view)).not.toMatch(/clientInfo|Mozilla|viewport|platform/);
  });
});

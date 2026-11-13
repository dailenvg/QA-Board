import { describe, expect, it, vi } from "vitest";
import { STATE } from "@/test/share-fixture";
import {
  addFolder,
  NOW,
  TEST_AUTH_SECRET,
  twoWorkspaces,
  URL_PROJECT,
} from "@/test/workspace-fixture";
import type { InviteBatch } from "../share/invite-email";
import { inlineBackend } from "../share/blob-backend";
import { createPostgresStore } from "../share/postgres-store";
import { createShare } from "../share/service";
import { createProject, listProjects, setArchived } from "./projects";
import { inviteeKey, sendInvites, type InviteDeps } from "./share-invites";
import { attachShare, changeSharePassword, changeShareSettings } from "./share-links";

const HOUR = 60 * 60 * 1000;
const ENV = { AUTH_URL: "https://squint.test", EMAIL_FROM: "Squint <noreply@squint.test>" };

async function setup() {
  const fixture = await twoWorkspaces();
  const { db, a } = fixture;
  await addFolder(db, a.workspaceId);
  await createProject(db, a.workspaceId, URL_PROJECT("p1"), NOW);
  const created = await createShare(
    { store: createPostgresStore(db), blobs: inlineBackend },
    STATE,
    NOW,
  );
  const proof = { shareId: created.shareId, token: created.token, ownerKey: created.ownerKey };
  await db.transaction((tx) => attachShare(tx, a.workspaceId, "p1", proof, NOW, TEST_AUTH_SECRET));
  const sent: InviteBatch[] = [];
  const deps: InviteDeps = {
    send: vi.fn((batch: InviteBatch) => {
      sent.push(batch);
      return Promise.resolve();
    }),
    env: ENV,
    secret: TEST_AUTH_SECRET,
  };
  const actor = { userId: a.userId, workspaceId: a.workspaceId };
  return { ...fixture, created, sent, deps, actor };
}

describe("emailing a link's invitation", () => {
  it("sends it from the workspace's sender, with the link, the client and the deadline", async () => {
    const { db, actor, created, sent, deps } = await setup();
    await db.query("UPDATE workspaces SET name = 'Acme', from_email_name = 'Acme Studio Team'");
    await changeShareSettings(db, actor, "p1", { clientName: "Bravo Co" }, NOW);
    const outcome = await sendInvites(db, actor, "p1", ["ana@bravo.test"], NOW + HOUR, deps);
    expect(outcome).toEqual({ ok: true, sent: 1, invitedCount: 1 });
    expect(sent).toEqual([
      {
        to: ["ana@bravo.test"],
        from: '"Acme Studio Team via Squint" <noreply@squint.test>',
        details: {
          company: "Acme",
          project: STATE.project.name,
          client: "Bravo Co",
          link: `https://squint.test/s/${created.token}`,
          reviewEndsAt: NOW + 72 * HOUR,
          hasPassword: false,
        },
      },
    ]);
  });

  it("says the link is protected, never its password", async () => {
    const { db, actor, sent, deps } = await setup();
    await changeSharePassword(db, actor, "p1", "a long password", NOW);
    await sendInvites(db, actor, "p1", ["ana@bravo.test"], NOW, deps);
    expect(sent[0]?.details.hasPassword).toBe(true);
    expect(JSON.stringify(sent)).not.toContain("a long password");
  });

  it("counts different people, recording only HMACs of their addresses", async () => {
    const { db, actor, a, deps } = await setup();
    const first = await sendInvites(
      db,
      actor,
      "p1",
      ["ana@bravo.test", "leo@bravo.test"],
      NOW,
      deps,
    );
    expect(first).toMatchObject({ ok: true, invitedCount: 2 });
    // Ana again, and Mia: three people so far.
    const second = await sendInvites(
      db,
      actor,
      "p1",
      ["ana@bravo.test", "mia@bravo.test"],
      NOW,
      deps,
    );
    expect(second).toMatchObject({ ok: true, sent: 2, invitedCount: 3 });
    const projects = await listProjects(db, a.workspaceId);
    expect(projects[0]?.share?.invitedCount).toBe(3);

    const { rows } = await db.query<{ action: string; meta: unknown }>(
      "SELECT action, meta FROM audit_log WHERE action = 'share.invites_sent' ORDER BY id",
    );
    expect(rows).toHaveLength(2);
    const logged = JSON.stringify(rows);
    expect(logged).not.toMatch(/@bravo\.test|ana|leo|mia/);
    expect(rows[0]?.meta).toMatchObject({
      fields: ["invites"],
      recipients: [
        inviteeKey("ana@bravo.test", TEST_AUTH_SECRET),
        inviteeKey("leo@bravo.test", TEST_AUTH_SECRET),
      ],
    });
  });

  it("answers not-found without a link, link-closed when archived, review-closed after the window", async () => {
    const { db, actor, a, sent, deps } = await setup();
    await createProject(db, a.workspaceId, URL_PROJECT("p2"), NOW);
    expect(await sendInvites(db, actor, "p2", ["ana@bravo.test"], NOW, deps)).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(await sendInvites(db, actor, "p1", ["ana@bravo.test"], NOW + 72 * HOUR, deps)).toEqual({
      ok: false,
      reason: "review-closed",
    });
    await setArchived(db, a.workspaceId, "p1", true, NOW);
    expect(await sendInvites(db, actor, "p1", ["ana@bravo.test"], NOW, deps)).toEqual({
      ok: false,
      reason: "link-closed",
    });
    expect(sent).toEqual([]);
  });

  it("never reaches another workspace's link", async () => {
    const { db, b, sent, deps } = await setup();
    const outsider = { userId: b.userId, workspaceId: b.workspaceId };
    expect(await sendInvites(db, outsider, "p1", ["ana@bravo.test"], NOW, deps)).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(sent).toEqual([]);
  });

  it("on a preview, only sends to the workspace's members and names the others", async () => {
    const { db, actor, a, sent, deps } = await setup();
    const { rows } = await db.query<{ email: string }>("SELECT email FROM users WHERE id = $1", [
      a.userId,
    ]);
    const own = rows[0]?.email ?? "";
    const preview = { ...deps, env: { ...ENV, NEXT_PUBLIC_VERCEL_ENV: "preview" } };
    expect(
      await sendInvites(
        db,
        actor,
        "p1",
        [own, "ana@bravo.test", "owner-2@bravo.test"],
        NOW,
        preview,
      ),
    ).toEqual({
      ok: false,
      reason: "members-only",
      addresses: ["ana@bravo.test", "owner-2@bravo.test"],
    });
    expect(sent).toEqual([]);
    expect(await sendInvites(db, actor, "p1", [own], NOW, preview)).toMatchObject({ ok: true });
    const onVercel = { ...deps, env: { ...ENV, VERCEL_ENV: "preview" } };
    expect(await sendInvites(db, actor, "p1", ["ana@bravo.test"], NOW, onVercel)).toMatchObject({
      reason: "members-only",
    });
  });

  it("holds a send over the limits whole, with when to retry", async () => {
    const { db, actor, sent, deps } = await setup();
    const ten = Array.from({ length: 10 }, (_, index) => `p${index}@bravo.test`);
    expect(await sendInvites(db, actor, "p1", ten, NOW, deps)).toMatchObject({ ok: true });
    expect(await sendInvites(db, actor, "p1", ten, NOW, deps)).toMatchObject({ ok: true });
    expect(await sendInvites(db, actor, "p1", ["late@bravo.test"], NOW, deps)).toEqual({
      ok: false,
      reason: "rate-limited",
      retryAfterSeconds: 3600,
    });
    expect(sent).toHaveLength(2);
  });

  it("answers send-failed when Resend refuses, recording nothing", async () => {
    const { db, actor, deps } = await setup();
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failing = { ...deps, send: () => Promise.reject(new Error("refused ana@bravo.test")) };
    expect(await sendInvites(db, actor, "p1", ["ana@bravo.test"], NOW, failing)).toEqual({
      ok: false,
      reason: "send-failed",
    });
    expect(JSON.stringify(error.mock.calls)).not.toContain("ana@bravo.test");
    error.mockRestore();
    const { rows } = await db.query("SELECT 1 FROM audit_log WHERE action = 'share.invites_sent'");
    expect(rows).toEqual([]);
  });

  it("fails closed without AUTH_SECRET, before sending anything", async () => {
    const { db, actor, sent, deps } = await setup();
    await expect(
      sendInvites(db, actor, "p1", ["ana@bravo.test"], NOW, { ...deps, secret: "" }),
    ).rejects.toThrow(/AUTH_SECRET/);
    expect(sent).toEqual([]);
  });
});

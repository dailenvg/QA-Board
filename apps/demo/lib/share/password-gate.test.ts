import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvingMetadata } from "next";
import * as viewRoute from "@/app/api/s/[token]/route";
import * as blobRoute from "@/app/api/s/[token]/blobs/[key]/route";
import * as logoRoute from "@/app/api/s/[token]/brand/logo/route";
import * as captureRoute from "@/app/api/s/[token]/capture/route";
import * as commentsRoute from "@/app/api/s/[token]/comments/route";
import * as unlockRoute from "@/app/api/s/[token]/unlock/route";
import SharedReviewPage, { generateMetadata } from "@/app/s/[token]/page";
import { ShareGate } from "@/components/share/ShareGate";
import type * as DatabaseModule from "@/lib/db/database";
import type * as ShareServerModule from "@/lib/share/server";
import { seedLogo } from "@/test/brand-fixture";
import { JPEG, PNG, STATE } from "@/test/share-fixture";
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
import { createProject } from "../workspace/projects";
import { inlineBackend } from "./blob-backend";
import { logoVersion } from "./brand";
import { invitationCard, invitationOf, openGuestShare } from "./guest-share";
import { createPostgresStore } from "./postgres-store";
import { createShare, putOwnerBlob, type CreatedShare } from "./service";

/**
 * The password gate, end to end through the route handlers: every guest
 * surface of a protected link (API, page, metadata, preview card) shows
 * nothing of its project but its name without a guest pass, and everything
 * with one.
 */

const holder = vi.hoisted(() => ({ db: null as Database | null, cookie: null as string | null }));

vi.mock("@/lib/db/database", async (importOriginal) => ({
  ...(await importOriginal<typeof DatabaseModule>()),
  database: () => (holder.db ? Promise.resolve(holder.db) : null),
}));

vi.mock("@/lib/share/server", async (importOriginal) => ({
  ...(await importOriginal<typeof ShareServerModule>()),
  shareServices: () =>
    Promise.resolve({ store: createPostgresStore(holder.db as Database), blobs: inlineBackend }),
}));

vi.mock("@/lib/capture/capture", () => ({
  capture: (_url: URL, width: number) =>
    Promise.resolve({ body: JPEG, contentType: "image/jpeg", width, height: 900, scale: 1 }),
}));

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers(holder.cookie ? { cookie: holder.cookie } : {})),
}));

const PASSWORD = "correct horse battery";
const PROJECT_NAME = STATE.project.name;
/** What a locked link must never hand out: the snapshot's id, a comment's body, the site's address. */
const LOCKED_LEAKS = ["snap-1", "Tighten the hero", "acme.example"];

let db: Database;
let a: Seat;
let address = 0;

beforeEach(async () => {
  vi.stubEnv("AUTH_SECRET", TEST_AUTH_SECRET);
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
  vi.stubEnv("VERCEL", "");
  ({ db, a } = await twoWorkspaces());
  holder.db = db;
  holder.cookie = null;
  await addFolder(db, a.workspaceId);
});

const link = (projectId: string) => `/api/w/${a.workspaceId}/projects/${projectId}/share-link`;

/** A workspace project's review link, with a snapshot image, protected by `password` unless null. */
async function linkedShare(projectId: string, password: string | null): Promise<CreatedShare> {
  await createProject(db, a.workspaceId, URL_PROJECT(projectId), NOW);
  const services = { store: createPostgresStore(db), blobs: inlineBackend };
  // Made now, so its review window is open for the guest's comments.
  const created = await createShare(services, STATE, Date.now());
  const record = await services.store.byId(created.shareId);
  if (!record) throw new Error("no share");
  await putOwnerBlob(services, record, "snapshot:snap-1", PNG);
  const proof = { shareId: created.shareId, token: created.token, ownerKey: created.ownerKey };
  expect((await call("PUT", link(projectId), { cookie: a.cookie, body: proof })).status).toBe(200);
  if (password !== null) await setPassword(projectId, password);
  return created;
}

async function setPassword(projectId: string, password: string): Promise<void> {
  const set = await call("PUT", `${link(projectId)}/password`, {
    cookie: a.cookie,
    body: { password },
  });
  expect(set.status).toBe(200);
}

const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

/** A guest of `token`, from an address of its own, sending `cookie` when given. */
function guest(token: string, cookie: string | null = null) {
  address += 1;
  const ip = `203.0.113.${address % 250}`;
  const request = (path: string, init: RequestInit = {}, url = "http://localhost") => {
    const headers = new Headers(init.headers);
    headers.set("x-forwarded-for", ip);
    if (cookie) headers.set("cookie", cookie);
    return new Request(`${url}/api/s/${token}${path}`, { ...init, headers });
  };
  const form = () => {
    const body = new FormData();
    body.set(
      "comment",
      JSON.stringify({
        id: `g-${address}-${Math.random().toString(36).slice(2)}`,
        x: 1,
        y: 1,
        body: "Hi",
        author: "Cleo",
      }),
    );
    return body;
  };
  return {
    view: () => viewRoute.GET(request(""), params({ token })),
    image: () =>
      blobRoute.GET(request("/blobs/snapshot:snap-1"), params({ token, key: "snapshot:snap-1" })),
    comment: () =>
      commentsRoute.POST(request("/comments", { method: "POST", body: form() }), params({ token })),
    capture: () =>
      captureRoute.POST(
        request("/capture", { method: "POST", body: JSON.stringify({ width: 800 }) }),
        params({ token }),
      ),
    logo: (version: string) =>
      logoRoute.GET(request(`/brand/logo?v=${version}`), params({ token })),
    unlock: (password: unknown, init: RequestInit = {}, url?: string) =>
      unlockRoute.POST(
        request(
          "/unlock",
          {
            method: "POST",
            body: JSON.stringify({ password }),
            ...init,
            headers: { "content-type": "application/json", ...init.headers },
          },
          url,
        ),
        params({ token }),
      ),
  };
}

type Guest = ReturnType<typeof guest>;

async function statuses(g: Guest) {
  return {
    view: (await g.view()).status,
    image: (await g.image()).status,
    comment: (await g.comment()).status,
    capture: (await g.capture()).status,
  };
}

/** The `name=value` of the pass cookie a response sets, and its attributes. */
function passCookie(response: Response): { pair: string; attributes: string } {
  const header = response.headers.get("set-cookie") ?? "";
  const [pair = "", ...attributes] = header.split(";").map((part) => part.trim());
  return { pair, attributes: attributes.join("; ") };
}

async function unlocked(token: string): Promise<string> {
  const response = await guest(token).unlock(PASSWORD);
  expect(response.status).toBe(200);
  return passCookie(response).pair;
}

describe("a password-protected review link", () => {
  it("answers 401 password-required on every guest route without a pass, saying nothing more", async () => {
    const created = await linkedShare("p1", PASSWORD);
    const g = guest(created.token);
    expect(await statuses(g)).toEqual({ view: 401, image: 401, comment: 401, capture: 401 });
    const view = await g.view();
    expect(view.headers.get("cache-control")).toBe("no-store");
    expect(await view.json()).toEqual({ error: "password-required" });
    // Nothing a locked guest asked for got in.
    const { rows } = await db.query("SELECT 1 FROM squint_share_comments WHERE origin = 'client'");
    expect(rows).toHaveLength(0);
  });

  it("opens every guest route with the pass the right password sets", async () => {
    const created = await linkedShare("p1", PASSWORD);
    const cookie = await unlocked(created.token);
    expect(await statuses(guest(created.token, cookie))).toEqual({
      view: 200,
      image: 200,
      comment: 201,
      capture: 201,
    });
    const view = (await (await guest(created.token, cookie).view()).json()) as {
      project: { name: string };
    };
    expect(view.project.name).toBe(PROJECT_NAME);
  });

  it("keeps the company's logo open without a pass", async () => {
    const created = await linkedShare("p1", PASSWORD);
    const key = await seedLogo(db, a.workspaceId, PNG);
    expect((await guest(created.token).logo(logoVersion(key))).status).toBe(200);
  });

  it("sets an HttpOnly, SameSite=Lax pass for the whole site for 12 hours, Secure off local http", async () => {
    const created = await linkedShare("p1", PASSWORD);
    const before = Date.now();
    const response = await guest(created.token).unlock(PASSWORD, {}, "https://squint.test");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const { passExpiresAt } = (await response.json()) as { passExpiresAt: number };
    expect(passExpiresAt).toBeGreaterThanOrEqual(before + 12 * 60 * 60 * 1000);
    const { pair, attributes } = passCookie(response);
    expect(pair).toMatch(/^squint_pass_[A-Za-z0-9_-]{22}=\d+\.[A-Za-z0-9_-]{43}$/);
    expect(pair).not.toContain(created.token);
    expect(pair).not.toContain(created.shareId);
    expect(attributes).toContain("Path=/");
    expect(attributes).toContain("Max-Age=43200");
    expect(attributes).toContain("HttpOnly");
    expect(attributes).toContain("Secure");
    expect(attributes.toLowerCase()).toContain("samesite=lax");
    const local = await guest(created.token).unlock(PASSWORD, {}, "http://127.0.0.1:3100");
    expect(passCookie(local).attributes).not.toContain("Secure");
  });

  it("answers 401 wrong-password for a wrong one, then 429 with Retry-After after 5", async () => {
    const created = await linkedShare("p1", PASSWORD);
    const g = guest(created.token);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const wrong = await g.unlock("not the password");
      expect(wrong.status).toBe(401);
      expect(wrong.headers.get("set-cookie")).toBeNull();
      expect(await wrong.json()).toEqual({ error: "wrong-password" });
    }
    // Even the right password waits the limit out.
    const limited = await g.unlock(PASSWORD);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(14 * 60);
    expect(await limited.json()).toMatchObject({ error: "rate-limited" });
    expect(limited.headers.get("set-cookie")).toBeNull();
    // Another address isn't held back.
    expect((await guest(created.token).unlock(PASSWORD)).status).toBe(200);
  });

  it("refuses a malformed or overlong password (400, uncounted) and another site's post (403)", async () => {
    const created = await linkedShare("p1", PASSWORD);
    const g = guest(created.token);
    for (const password of ["", 12345678, "x".repeat(129)]) {
      const refused = await g.unlock(password);
      expect(refused.status).toBe(400);
      expect(await refused.json()).toEqual({ error: "invalid", field: "password" });
    }
    const crossSite = await g.unlock(PASSWORD, {
      headers: { origin: "https://evil.test", host: "localhost" },
    });
    expect(crossSite.status).toBe(403);
    const { rows } = await db.query("SELECT 1 FROM squint_share_password_attempts");
    expect(rows).toHaveLength(0);
    expect((await guest("x".repeat(43)).unlock(PASSWORD)).status).toBe(404);
  });

  it("voids every pass when the password changes, even to the same one, or is removed", async () => {
    const created = await linkedShare("p1", PASSWORD);
    const cookie = await unlocked(created.token);
    await setPassword("p1", PASSWORD);
    expect((await guest(created.token, cookie).view()).status).toBe(401);
    const fresh = await unlocked(created.token);
    expect((await guest(created.token, fresh).view()).status).toBe(200);

    const removed = await call("DELETE", `${link("p1")}/password`, {
      cookie: a.cookie,
      headers: { "content-type": "application/json" },
    });
    expect(removed.status).toBe(200);
    expect(await statuses(guest(created.token))).toEqual({
      view: 200,
      image: 200,
      comment: 201,
      capture: 201,
    });
    // A password set again doesn't bring the old passes back.
    await setPassword("p1", PASSWORD);
    expect((await guest(created.token, fresh).view()).status).toBe(401);
  });

  it("gives a pass for its own link only", async () => {
    const first = await linkedShare("p1", PASSWORD);
    const second = await linkedShare("p2", PASSWORD);
    const cookie = await unlocked(first.token);
    expect((await guest(second.token, cookie).view()).status).toBe(401);
    expect((await guest(first.token, cookie).view()).status).toBe(200);
  });
});

describe("unlocking a link without a password", () => {
  it("answers ok with no pass, sets nothing and counts nothing", async () => {
    const created = await linkedShare("p1", null);
    const response = await guest(created.token).unlock("anything at all");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ passExpiresAt: null });
    expect(response.headers.get("set-cookie")).toBeNull();
    expect((await guest(created.token).view()).status).toBe(200);
  });
});

describe("a protected link's page, metadata and preview card", () => {
  const parent = Promise.resolve({
    openGraph: { images: [] },
    twitter: { images: [] },
  }) as unknown as ResolvingMetadata;

  it("render locked without a pass: the project's name, and no source, pages or comments", async () => {
    const created = await linkedShare("p1", PASSWORD);
    const locked = await openGuestShare(created.token, null);
    const expected = {
      locked: true,
      brand: { custom: true, name: "acme" },
      projectName: PROJECT_NAME,
    };
    expect(locked).toMatchObject(expected);
    expect(Object.keys(locked ?? {}).sort()).toEqual(Object.keys(expected).sort());
    const wire = JSON.stringify(locked);
    for (const leak of LOCKED_LEAKS) expect(wire).not.toContain(leak);
    const page = await SharedReviewPage(params({ token: created.token }));
    expect(page.type).toBe(ShareGate);
    // What the page hands the browser: the brand and the project's name, nothing else of it.
    const { initial } = page.props as { initial: object };
    expect(initial).toMatchObject(expected);
    expect(Object.keys(initial).sort()).toEqual(Object.keys(expected).sort());
    const props = JSON.stringify(page.props);
    for (const leak of LOCKED_LEAKS) expect(props).not.toContain(leak);
  });

  it("open with a pass", async () => {
    const created = await linkedShare("p1", PASSWORD);
    const cookie = await unlocked(created.token);
    const open = await openGuestShare(created.token, cookie);
    expect(open).toMatchObject({ locked: false });
    expect(open?.locked === false && open.view.project.name).toBe(PROJECT_NAME);
    holder.cookie = cookie;
    const page = await SharedReviewPage(params({ token: created.token }));
    expect(page.type).toBe(ShareGate);
    expect(page.props).toMatchObject({
      token: created.token,
      initial: { locked: false, view: { project: STATE.project } },
    });
  });

  it("name the company and the project in the preview, pass or not, and nothing more", async () => {
    const created = await linkedShare("p1", PASSWORD);
    const cookie = await unlocked(created.token);
    for (const sent of [null, cookie]) {
      expect(invitationOf(await openGuestShare(created.token, sent))).toEqual({
        company: "acme",
        project: PROJECT_NAME,
      });
      holder.cookie = sent;
      const metadata = await generateMetadata(params({ token: created.token }), parent);
      expect(metadata.openGraph?.title).toBe(`acme invited you to review ${PROJECT_NAME}`);
      expect(metadata.twitter?.title).toBe(`acme invited you to review ${PROJECT_NAME}`);
      for (const leak of LOCKED_LEAKS) expect(JSON.stringify(metadata)).not.toContain(leak);
    }
    const card = await invitationCard(created.token);
    expect(card).toMatchObject({ company: "acme", project: PROJECT_NAME });
    for (const leak of LOCKED_LEAKS) expect(JSON.stringify(card)).not.toContain(leak);
  });

  it("name the project on an open link, as before", async () => {
    const created = await linkedShare("p1", null);
    expect(invitationOf(await openGuestShare(created.token, null))).toEqual({
      company: "acme",
      project: PROJECT_NAME,
    });
    expect(await invitationCard(created.token)).toMatchObject({ project: PROJECT_NAME });
    const metadata = await generateMetadata(params({ token: created.token }), parent);
    expect(metadata.openGraph?.title).toBe(`acme invited you to review ${PROJECT_NAME}`);
  });
});

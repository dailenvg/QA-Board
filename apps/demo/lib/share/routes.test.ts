import { describe, expect, it, vi } from "vitest";
import * as viewRoute from "@/app/api/s/[token]/route";
import * as clientBlobRoute from "@/app/api/s/[token]/blobs/[key]/route";
import * as captureRoute from "@/app/api/s/[token]/capture/route";
import * as clientCommentsRoute from "@/app/api/s/[token]/comments/route";
import * as shareRoute from "@/app/api/shares/[shareId]/route";
import * as ownerBlobRoute from "@/app/api/shares/[shareId]/blobs/[key]/route";
import * as changesRoute from "@/app/api/shares/[shareId]/changes/route";
import * as createRoute from "@/app/api/shares/route";
import { PNG, STATE } from "@/test/share-fixture";
import { OWNER_KEY_HEADER } from "./http";
import { REVIEW_WINDOW_MS } from "./review-window";
import type { CreatedShare } from "./service";

let ip = 0;
/** Each request from its own address, so the per-IP limits don't interfere. */
function request(path: string, init: RequestInit & { ownerKey?: string } = {}): Request {
  ip += 1;
  const headers = new Headers(init.headers);
  headers.set("x-forwarded-for", `203.0.113.${ip % 250}`);
  if (init.ownerKey) headers.set(OWNER_KEY_HEADER, init.ownerKey);
  return new Request(`http://localhost${path}`, { ...init, headers });
}

const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

async function create(): Promise<CreatedShare> {
  const response = await createRoute.POST(
    request("/api/shares", { method: "POST", body: JSON.stringify(STATE) }),
  );
  expect(response.status).toBe(201);
  return (await response.json()) as CreatedShare;
}

/** Every owner route, called with `ownerKey` (or none). */
function ownerCalls(share: CreatedShare, ownerKey?: string) {
  const id = share.shareId;
  const push = JSON.stringify({ project: STATE.project, cursor: 0 });
  return {
    push: () =>
      shareRoute.PATCH(
        request(`/api/shares/${id}`, { method: "PATCH", body: push, ownerKey }),
        params({ shareId: id }),
      ),
    pull: () =>
      changesRoute.GET(
        request(`/api/shares/${id}/changes?since=0`, { ownerKey }),
        params({ shareId: id }),
      ),
    upload: () =>
      ownerBlobRoute.PUT(
        request(`/api/shares/${id}/blobs/crop:c-1`, { method: "PUT", body: PNG, ownerKey }),
        params({ shareId: id, key: "crop:c-1" }),
      ),
    download: () =>
      ownerBlobRoute.GET(
        request(`/api/shares/${id}/blobs/crop:c-1`, { ownerKey }),
        params({ shareId: id, key: "crop:c-1" }),
      ),
    revoke: () =>
      shareRoute.DELETE(
        request(`/api/shares/${id}`, { method: "DELETE", ownerKey }),
        params({ shareId: id }),
      ),
  };
}

/** Every client route, called with `token`. */
function clientCalls(token: string) {
  const form = new FormData();
  form.set("comment", JSON.stringify({ id: `k-${ip}`, x: 1, y: 1, body: "Hi", author: "Cleo" }));
  return {
    view: () => viewRoute.GET(request(`/api/s/${token}`), params({ token })),
    image: () =>
      clientBlobRoute.GET(
        request(`/api/s/${token}/blobs/crop:c-1`),
        params({ token, key: "crop:c-1" }),
      ),
    comment: () =>
      clientCommentsRoute.POST(
        request(`/api/s/${token}/comments`, { method: "POST", body: form }),
        params({ token }),
      ),
    capture: () =>
      captureRoute.POST(
        request(`/api/s/${token}/capture`, {
          method: "POST",
          body: JSON.stringify({ width: 800 }),
        }),
        params({ token }),
      ),
  };
}

async function statuses(calls: Record<string, () => Promise<Response>>) {
  const result: Record<string, number> = {};
  for (const [name, call] of Object.entries(calls)) result[name] = (await call()).status;
  return result;
}

describe("share routes: permissions", () => {
  it("owner routes need the owner key; the share token or nothing gets a plain 404", async () => {
    const share = await create();
    const notFound = { push: 404, pull: 404, upload: 404, download: 404, revoke: 404 };
    expect(await statuses(ownerCalls(share))).toEqual(notFound);
    expect(await statuses(ownerCalls(share, share.token))).toEqual(notFound);
    const body = await ownerCalls(share, share.token).push();
    expect(await body.json()).toEqual({ error: "not-found" });
  });

  it("the owner key works on owner routes", async () => {
    const share = await create();
    const owner = ownerCalls(share, share.ownerKey);
    expect((await owner.push()).status).toBe(200);
    expect((await owner.upload()).status).toBe(200);
    expect((await owner.download()).status).toBe(200);
    expect((await owner.pull()).status).toBe(200);
  });

  it("client routes need the share token; the owner key is not a token", async () => {
    const share = await create();
    const notFound = { view: 404, image: 404, comment: 404, capture: 404 };
    expect(await statuses(clientCalls(share.ownerKey))).toEqual(notFound);
    expect(await statuses(clientCalls("x".repeat(43)))).toEqual(notFound);
    const client = clientCalls(share.token);
    expect((await client.view()).status).toBe(200);
    expect((await client.comment()).status).toBe(201);
  });

  it("after revoke, every route answers 404", async () => {
    const share = await create();
    expect((await ownerCalls(share, share.ownerKey).revoke()).status).toBe(204);
    const owner = ownerCalls(share, share.ownerKey);
    expect(
      await statuses({
        push: owner.push,
        pull: owner.pull,
        upload: owner.upload,
        download: owner.download,
        revoke: owner.revoke,
      }),
    ).toEqual({
      push: 404,
      pull: 404,
      upload: 404,
      download: 404,
      revoke: 404,
    });
    expect(await statuses(clientCalls(share.token))).toEqual({
      view: 404,
      image: 404,
      comment: 404,
      capture: 404,
    });
  });

  it("after the review window, client writes answer 403 and the view still opens", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const share = await create();
      const opened = (await (await clientCalls(share.token).view()).json()) as {
        reviewEndsAt: number;
      };
      expect(opened.reviewEndsAt).toBe(Date.now() + REVIEW_WINDOW_MS);
      vi.setSystemTime(opened.reviewEndsAt);
      const { view, comment, capture } = clientCalls(share.token);
      expect(await statuses({ view, comment, capture })).toEqual({
        view: 200,
        comment: 403,
        capture: 403,
      });
      expect(await (await comment()).json()).toEqual({ error: "review-closed" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("clients can't change status or timestamps, and can't overwrite a comment", async () => {
    const share = await create();
    const form = new FormData();
    form.set(
      "comment",
      JSON.stringify({
        id: "c-1",
        x: 1,
        y: 1,
        body: "Overwrite",
        author: "Mallory",
        status: "resolved",
        createdAt: 1,
      }),
    );
    const response = await clientCommentsRoute.POST(
      request(`/api/s/${share.token}/comments`, { method: "POST", body: form }),
      params({ token: share.token }),
    );
    expect(response.status).toBe(409);
    const view = (await (await clientCalls(share.token).view()).json()) as {
      comments: Array<{ body: string }>;
    };
    expect(view.comments[0]?.body).toBe(STATE.comments[0]?.body);
  });

  it("refuses oversized and invalid bodies", async () => {
    const share = await create();
    const tooLong = { ...STATE, project: { ...STATE.project, name: "x".repeat(81) } };
    const invalid = await createRoute.POST(
      request("/api/shares", { method: "POST", body: JSON.stringify(tooLong) }),
    );
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: "invalid", field: "project.name" });
    const huge = await createRoute.POST(
      request("/api/shares", { method: "POST", body: "x".repeat(1024 * 1024 + 1) }),
    );
    expect(huge.status).toBe(413);
    // A website share has no pages, so a page image isn't referenced.
    const page = await ownerBlobRoute.PUT(
      request(`/api/shares/${share.shareId}/blobs/page%3Apage-1`, {
        method: "PUT",
        body: PNG,
        ownerKey: share.ownerKey,
      }),
      params({ shareId: share.shareId, key: "page%3Apage-1" }),
    );
    expect(page.status).toBe(422);
    // The key from before pages is no longer a blob key at all.
    const legacy = await ownerBlobRoute.PUT(
      request(`/api/shares/${share.shareId}/blobs/image`, {
        method: "PUT",
        body: PNG,
        ownerKey: share.ownerKey,
      }),
      params({ shareId: share.shareId, key: "image" }),
    );
    expect(legacy.status).toBe(400);
  });

  it("serves images privately, unsniffed and uncached", async () => {
    const share = await create();
    await ownerCalls(share, share.ownerKey).upload();
    const response = await clientCalls(share.token).image();
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });
});

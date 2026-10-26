import { afterEach, describe, expect, it } from "vitest";
import * as clientCommentsRoute from "@/app/api/s/[token]/comments/route";
import * as shareRoute from "@/app/api/shares/[shareId]/route";
import * as createRoute from "@/app/api/shares/route";
import { PNG, STATE } from "@/test/share-fixture";
import { inlineBackend, type BlobBackend } from "./blob-backend";
import { createMemoryStore } from "./memory-store";
import type { ShareServices } from "./server";
import { createShare } from "./service";
import type { ShareStore } from "./store";

const holder = globalThis as typeof globalThis & { squintShares?: Promise<ShareServices> };
afterEach(() => {
  holder.squintShares = undefined;
});

/** Routes use these services (the same seam `shareServices()` fills). */
function use(services: ShareServices) {
  holder.squintShares = Promise.resolve(services);
}

const failingBlobs: BlobBackend = {
  ...inlineBackend,
  save: () => Promise.reject(new Error("blob store down")),
};

let ip = 0;
const request = (path: string, init: RequestInit = {}) => {
  ip += 1;
  const headers = new Headers(init.headers);
  headers.set("x-forwarded-for", `192.0.2.${ip % 250}`);
  return new Request(`http://localhost${path}`, { ...init, headers });
};

function postComment(token: string, withCrop: boolean) {
  const form = new FormData();
  const crop = withCrop ? { crop: { rect: { x: 0, y: 0, width: 4, height: 4 } } } : {};
  form.set(
    "comment",
    JSON.stringify({ id: "k-1", x: 1, y: 1, body: "Hi", author: "Cleo", ...crop }),
  );
  if (withCrop) form.set("crop", new Blob([PNG], { type: "image/png" }), "crop.png");
  return clientCommentsRoute.POST(
    request(`/api/s/${token}/comments`, { method: "POST", body: form }),
    {
      params: Promise.resolve({ token }),
    },
  );
}

describe("share routes when storage fails", () => {
  it("answer a JSON 500 instead of an empty error, and leave nothing half-written", async () => {
    const store = createMemoryStore();
    // Created now: the comment route checks the review window against the real clock.
    const created = await createShare({ store, blobs: inlineBackend }, STATE, Date.now());
    use({ store, blobs: failingBlobs });

    const failed = await postComment(created.token, true);
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ error: "storage" });
    // The claimed id was released: once storage works, the same comment goes through.
    use({ store, blobs: inlineBackend });
    expect((await postComment(created.token, true)).status).toBe(201);
  });

  it("covers owner routes and link creation too", async () => {
    const store = createMemoryStore();
    const created = await createShare({ store, blobs: inlineBackend }, STATE, 1);
    const broken: ShareStore = {
      ...store,
      setProject: () => Promise.reject(new Error("database down")),
      create: () => Promise.reject(new Error("database down")),
    };
    use({ store: broken, blobs: inlineBackend });

    const patch = await shareRoute.PATCH(
      request(`/api/shares/${created.shareId}`, {
        method: "PATCH",
        body: JSON.stringify({ project: STATE.project, cursor: 0 }),
        headers: { "x-squint-owner-key": created.ownerKey },
      }),
      { params: Promise.resolve({ shareId: created.shareId }) },
    );
    expect(patch.status).toBe(500);
    expect(await patch.json()).toEqual({ error: "storage" });

    const create = await createRoute.POST(
      request("/api/shares", { method: "POST", body: JSON.stringify(STATE) }),
    );
    expect(create.status).toBe(500);
    expect(await create.json()).toEqual({ error: "storage" });
  });
});

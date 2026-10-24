import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as clientBlobRoute from "@/app/api/s/[token]/blobs/[key]/route";
import * as ownerBlobRoute from "@/app/api/shares/[shareId]/blobs/[key]/route";
import * as createRoute from "@/app/api/shares/route";
import { JPEG, STATE } from "@/test/share-fixture";
import { SHARE_LIMITS } from "../share/limits";
import type { CreatedShare } from "../share/types";
import { ownerApi } from "./api";
import { fetchInRanges } from "./transfer";

/** Every body that crossed the "network", to prove none was over the per-request limit. */
const bodies: number[] = [];

/** Routes the browser code's fetch calls to the real route handlers. */
async function routeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const request = new Request(
    new URL(input instanceof Request ? input.url : input.toString(), "http://localhost"),
    init,
  );
  request.headers.set("x-forwarded-for", "198.51.100.7");
  const body = init?.body instanceof Blob ? init.body.size : 0;
  bodies.push(body);
  const path = new URL(request.url).pathname;
  const owner = /^\/api\/shares\/([^/]+)\/blobs\/([^/]+)$/.exec(path);
  const client = /^\/api\/s\/([^/]+)\/blobs\/([^/]+)$/.exec(path);
  let response: Response;
  if (owner?.[1] && owner[2]) {
    const params = { params: Promise.resolve({ shareId: owner[1], key: owner[2] }) };
    response =
      request.method === "PUT"
        ? await ownerBlobRoute.PUT(request, params)
        : await ownerBlobRoute.GET(request, params);
  } else if (client?.[1] && client[2]) {
    response = await clientBlobRoute.GET(request, {
      params: Promise.resolve({ token: client[1], key: client[2] }),
    });
  } else {
    throw new Error(`No route for ${path}`);
  }
  const copy = response.clone();
  bodies.push((await copy.arrayBuffer()).byteLength);
  return response;
}

beforeEach(() => {
  bodies.length = 0;
  vi.stubGlobal("fetch", routeFetch);
});
afterEach(() => vi.unstubAllGlobals());

/** A 6 MB JPEG: over Vercel's 4.5 MB body limit, under the 8 MB snapshot limit. */
function bigSnapshot(): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(6 * 1024 * 1024);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = (index * 31) % 256;
  bytes.set(JPEG);
  return bytes;
}

async function same(blob: Blob | null, expected: Uint8Array): Promise<boolean> {
  return (
    Boolean(blob) && Buffer.from(await (blob as Blob).arrayBuffer()).equals(Buffer.from(expected))
  );
}

async function created(): Promise<CreatedShare> {
  const response = await createRoute.POST(
    new Request("http://localhost/api/shares", {
      method: "POST",
      body: JSON.stringify(STATE),
      headers: { "x-forwarded-for": "198.51.100.8" },
    }),
  );
  return (await response.json()) as CreatedShare;
}

describe("big images on Vercel-sized requests", () => {
  it("uploads a 6 MB snapshot in parts and reads it back intact in ranges", async () => {
    const share = await created();
    const local = {
      id: share.shareId,
      token: share.token,
      ownerKey: share.ownerKey,
      createdAt: 0,
      cursor: 0,
    };
    const original = bigSnapshot();

    const uploaded = await ownerApi.upload(local, "snapshot:snap-1", new Blob([original]));
    expect(uploaded).toMatchObject({ ok: true, value: { complete: true, size: original.length } });

    const viaClient = await fetchInRanges(`/api/s/${share.token}/blobs/snapshot%3Asnap-1`);
    const viaOwner = await ownerApi.download(local, "snapshot:snap-1");
    expect(await same(viaClient, original)).toBe(true);
    expect(await same(viaOwner, original)).toBe(true);
    expect(viaClient?.type).toBe("image/jpeg");

    expect(Math.max(...bodies)).toBeLessThanOrEqual(SHARE_LIMITS.transferBytes);
    expect(bodies.filter((size) => size > 0).length).toBeGreaterThanOrEqual(6);
  });

  it("refuses a single request body over the transfer limit", async () => {
    const share = await created();
    const response = await ownerBlobRoute.PUT(
      new Request(`http://localhost/api/shares/${share.shareId}/blobs/snapshot:snap-1`, {
        method: "PUT",
        body: bigSnapshot(),
        headers: { "x-squint-owner-key": share.ownerKey, "x-forwarded-for": "198.51.100.9" },
      }),
      { params: Promise.resolve({ shareId: share.shareId, key: "snapshot:snap-1" }) },
    );
    expect(response.status).toBe(413);
  });
});

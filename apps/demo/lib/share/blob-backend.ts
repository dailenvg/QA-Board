import { sweepOrphanBlobs, type SweepResult } from "./orphan-blobs";
import type { BlobLocation } from "./types";

/** Where image bytes go: inline in the share store, or Vercel Blob. */
export interface BlobBackend {
  save(
    shareId: string,
    key: string,
    bytes: Uint8Array,
    contentType: string,
    signal?: AbortSignal,
  ): Promise<BlobLocation>;
  read(location: BlobLocation): Promise<Uint8Array | null>;
  /** Best effort: a failed delete leaves an unreachable file, never a broken share. */
  discard(locations: readonly BlobLocation[]): Promise<void>;
  /**
   * Deletes files uploaded before `before` (epoch ms) whose share `isLive`
   * says is gone, until `deadline` (epoch ms). Only backends with files of
   * their own have it: inline bytes go with their rows.
   */
  sweep?(
    before: number,
    isLive: (shareId: string) => Promise<boolean>,
    deadline: number,
  ): Promise<SweepResult>;
}

/** Bytes live in the store itself (Postgres `bytea`, or memory). */
export const inlineBackend: BlobBackend = {
  save: (_shareId, _key, bytes) => Promise.resolve({ kind: "inline", bytes }),
  read: (location) => Promise.resolve(location.kind === "inline" ? location.bytes : null),
  discard: () => Promise.resolve(),
};

/**
 * Vercel Blob, as private blobs: reading one needs the token, so a leaked URL
 * alone shows nothing. URLs stay server-side; browsers get bytes through
 * token-gated routes. The SDK is loaded only when this backend is used.
 */
export function vercelBackend(token: string): BlobBackend {
  const sdk = () => import("@vercel/blob");
  return {
    async save(shareId, key, bytes, contentType, signal) {
      const { put } = await sdk();
      const pathname = `squint/${shareId}/${key.replaceAll(":", "-")}`;
      const result = await put(pathname, Buffer.from(bytes), {
        access: "private",
        contentType,
        token,
        addRandomSuffix: true,
        ...(signal ? { abortSignal: signal } : {}),
      });
      return { kind: "vercel", url: result.url };
    },
    async read(location) {
      if (location.kind === "inline") return location.bytes;
      const { get } = await sdk();
      const result = await get(location.url, { access: "private", token });
      if (!result || result.statusCode !== 200) return null;
      return new Uint8Array(await new Response(result.stream).arrayBuffer());
    },
    async discard(locations) {
      const urls = locations.flatMap((location) =>
        location.kind === "vercel" ? [location.url] : [],
      );
      if (urls.length === 0) return;
      const { del } = await sdk();
      await del(urls, { token }).catch(() => undefined);
    },
    async sweep(before, isLive, deadline) {
      const { del, list } = await sdk();
      const api = {
        list: (cursor?: string) =>
          list({ prefix: "squint/", token, ...(cursor ? { cursor } : {}) }),
        del: (urls: string[]) => del(urls, { token }),
      };
      return sweepOrphanBlobs(api, before, isLive, deadline);
    },
  };
}

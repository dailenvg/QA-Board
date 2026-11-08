import type { HandleUploadBody } from "@vercel/blob/client";
import type { BlobLocation } from "../share/types";
import { inlineBlobDriver } from "./inline-blob-driver";
import { vercelBlobDriver } from "./vercel-blob-driver";

/** A file uploaded straight from a browser, as the store reports it. */
export interface UploadedFile {
  url: string;
  size: number;
  contentType: string;
}

export interface ListedFile {
  url: string;
  pathname: string;
  uploadedAt: Date;
}

/** What a client upload token allows, decided by the route before it's issued. */
export interface UploadGrant {
  pathname: string;
  contentType: string;
  maximumSizeInBytes: number;
  validUntil: number;
  /** Signed into the token and handed back with the completion callback. */
  tokenPayload: string;
}

/**
 * Where a workspace's files live. Vercel Blob in every deployment; inline
 * (`workspace_blobs.bytes`) for local development and e2e only. Rows always
 * hold the location; a driver reads and deletes what a row points at.
 */
export interface BlobDriver {
  readonly kind: "vercel" | "inline";
  read(location: BlobLocation): Promise<Uint8Array | null>;
  /** Best effort: a failed delete leaves a file the cron sweeps, never a broken row. */
  discard(locations: readonly BlobLocation[]): Promise<void>;
}

/** Vercel Blob: browsers upload with a token the server issues, then the server checks the file. */
export interface ClientUploadDriver extends BlobDriver {
  readonly kind: "vercel";
  /** The file at `pathname`, or null when nothing was uploaded there. */
  head(pathname: string): Promise<UploadedFile | null>;
  /**
   * Answers `@vercel/blob/client`'s upload route: a token for `grant` (built
   * from the request by the caller), or a verified completion callback.
   */
  handleUpload(
    request: Request,
    body: HandleUploadBody,
    grant: (pathname: string) => UploadGrant,
    completed: (tokenPayload: string) => Promise<void>,
  ): Promise<unknown>;
  /** One page of the files under `prefix`. */
  list(
    prefix: string,
    cursor?: string,
  ): Promise<{ files: ListedFile[]; cursor?: string; hasMore: boolean }>;
}

/**
 * Stores a small file the server already holds and has checked (a logo, an
 * avatar), at a fixed pathname that's never overwritten; returns where it
 * now lives, for its row.
 */
export interface BlobWriter {
  put(pathname: string, bytes: Uint8Array, contentType: string): Promise<BlobLocation>;
}

export type AnyBlobDriver = ClientUploadDriver | (BlobDriver & { readonly kind: "inline" });

/** Reads BLOB_READ_WRITE_TOKEN and VERCEL. */
type DriverEnv = Readonly<Record<string, string | undefined>>;

/**
 * Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set, else inline, which refuses
 * to run on a Vercel deployment (`inlineBlobDriver`).
 */
export function blobDriverFromEnv(env: DriverEnv = process.env): AnyBlobDriver & BlobWriter {
  const token = env.BLOB_READ_WRITE_TOKEN?.trim();
  return token ? vercelBlobDriver(token) : inlineBlobDriver(env);
}

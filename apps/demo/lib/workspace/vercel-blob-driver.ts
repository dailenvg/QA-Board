import type { HandleUploadBody } from "@vercel/blob/client";
import type { BlobWriter, ClientUploadDriver, UploadGrant } from "./blob-driver";

/**
 * Vercel Blob, private (the store's access): reading a file needs the token,
 * so its URL alone shows nothing, and URLs never leave the server. Browsers
 * upload straight to the store with a short-lived client token for one fixed
 * pathname (no random suffix, no overwrite); a logo or avatar, which the
 * server checks first, the server puts there itself, under the same rules.
 * The SDK loads only when used.
 */
export function vercelBlobDriver(token: string): ClientUploadDriver & BlobWriter {
  const sdk = () => import("@vercel/blob");
  return {
    kind: "vercel",
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
    async put(pathname, bytes, contentType) {
      const { put } = await sdk();
      const stored = await put(pathname, Buffer.from(bytes), {
        access: "private",
        token,
        contentType,
        addRandomSuffix: false,
        allowOverwrite: false,
      });
      return { kind: "vercel", url: stored.url };
    },
    async head(pathname) {
      const { BlobNotFoundError, head } = await sdk();
      try {
        const found = await head(pathname, { token });
        return { url: found.url, size: found.size, contentType: found.contentType };
      } catch (error) {
        if (error instanceof BlobNotFoundError) return null;
        throw error;
      }
    },
    async handleUpload(request, body: HandleUploadBody, grant, completed) {
      const { handleUpload } = await import("@vercel/blob/client");
      return handleUpload({
        token,
        request,
        body,
        onBeforeGenerateToken: (pathname) => {
          const allowed: UploadGrant = grant(pathname);
          return Promise.resolve({
            allowedContentTypes: [allowed.contentType],
            maximumSizeInBytes: allowed.maximumSizeInBytes,
            validUntil: allowed.validUntil,
            addRandomSuffix: false,
            allowOverwrite: false,
            tokenPayload: allowed.tokenPayload,
          });
        },
        onUploadCompleted: ({ tokenPayload }) => completed(tokenPayload ?? ""),
      });
    },
    async list(prefix, cursor) {
      const { list } = await sdk();
      const page = await list({ prefix, token, ...(cursor ? { cursor } : {}) });
      return {
        files: page.blobs.map(({ url, pathname, uploadedAt }) => ({ url, pathname, uploadedAt })),
        hasMore: page.hasMore,
        ...(page.cursor ? { cursor: page.cursor } : {}),
      };
    },
  };
}

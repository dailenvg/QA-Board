import { sniffImageType } from "../share/sniff";
import {
  IMAGE_MAX_BYTES,
  imageSizeError,
  isImageType,
  type ImageKind,
  type ImageType,
} from "./image-rules";

/**
 * The server's check of an uploaded avatar or logo, from its bytes alone: the
 * type its first bytes say (whatever the request claimed), and the size its
 * header says, held to `image-rules.ts`. Nothing is decoded past the header.
 */

export interface CheckedImage {
  bytes: Uint8Array;
  contentType: ImageType;
  width: number;
  height: number;
}

export type ImageRefusal = "too-large" | "wrong-kind" | "wrong-size";

export type ImageCheck = { ok: true; image: CheckedImage } | { ok: false; reason: ImageRefusal };

interface Size {
  width: number;
  height: number;
}

const u16be = (b: Uint8Array, at: number) => ((b[at] ?? 0) << 8) | (b[at + 1] ?? 0);
const u16le = (b: Uint8Array, at: number) => (b[at] ?? 0) | ((b[at + 1] ?? 0) << 8);
const u24le = (b: Uint8Array, at: number) => u16le(b, at) | ((b[at + 2] ?? 0) << 16);
const u32be = (b: Uint8Array, at: number) => u16be(b, at) * 0x10000 + u16be(b, at + 2);
const ascii = (b: Uint8Array, at: number, length: number) =>
  String.fromCharCode(...b.subarray(at, at + length));

/** PNG: the IHDR chunk comes first, right after the 8-byte signature. */
function pngSize(b: Uint8Array): Size | null {
  if (b.length < 24 || ascii(b, 12, 4) !== "IHDR") return null;
  return { width: u32be(b, 16), height: u32be(b, 20) };
}

/** JPEG start-of-frame markers (baseline, progressive, lossless, arithmetic), which carry the size. */
const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

/** JPEG: walks the segments to the first start-of-frame, stopping at the scan. */
function jpegSize(b: Uint8Array): Size | null {
  let at = 2;
  while (at + 4 <= b.length) {
    if (b[at] !== 0xff) return null;
    const marker = b[at + 1] ?? 0;
    // Fill bytes before a marker.
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    // Markers with no length: restarts, TEM.
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      at += 2;
      continue;
    }
    // The image data starts (or ends) before any frame said how big it is.
    if (marker === 0xda || marker === 0xd9) return null;
    const length = u16be(b, at + 2);
    if (length < 2) return null;
    if (SOF.has(marker)) {
      if (at + 9 > b.length) return null;
      return { height: u16be(b, at + 5), width: u16be(b, at + 7) };
    }
    at += 2 + length;
  }
  return null;
}

/** WebP: the first chunk is lossy (`VP8 `), lossless (`VP8L`) or extended (`VP8X`). */
function webpSize(b: Uint8Array): Size | null {
  switch (ascii(b, 12, 4)) {
    case "VP8 ":
      // A key frame's start code, then 14-bit width and height.
      if (b.length < 30 || b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
      return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
    case "VP8L": {
      if (b.length < 25 || b[20] !== 0x2f) return null;
      const bits = (u16le(b, 21) | (u16le(b, 23) << 16)) >>> 0;
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    case "VP8X":
      if (b.length < 30) return null;
      return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
    default:
      return null;
  }
}

/** The width and height a PNG, JPEG or WebP header gives; null when it can't be read. */
export function imageDimensions(bytes: Uint8Array, type: ImageType): Size | null {
  const size =
    type === "image/png"
      ? pngSize(bytes)
      : type === "image/jpeg"
        ? jpegSize(bytes)
        : webpSize(bytes);
  return size && size.width > 0 && size.height > 0 ? size : null;
}

/**
 * Whether `bytes` may be stored as `kind`: at most 1 MB, a PNG, JPEG or WebP
 * by its first bytes (a GIF, an empty body or anything else is `wrong-kind`,
 * as is a header that can't be read), and of a size `imageSizeError` allows
 * (`wrong-size`).
 */
export function checkImage(kind: ImageKind, bytes: Uint8Array): ImageCheck {
  if (bytes.length > IMAGE_MAX_BYTES) return { ok: false, reason: "too-large" };
  const type = sniffImageType(bytes);
  if (!type || !isImageType(type)) return { ok: false, reason: "wrong-kind" };
  const size = imageDimensions(bytes, type);
  if (!size) return { ok: false, reason: "wrong-kind" };
  if (imageSizeError(kind, size.width, size.height)) return { ok: false, reason: "wrong-size" };
  return { ok: true, image: { bytes, contentType: type, ...size } };
}

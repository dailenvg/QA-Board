/**
 * The first bytes of PNG, JPEG and WebP files of a given size: enough for a
 * check that reads only the header (`lib/account/image-check.ts`), not a
 * picture anything could draw.
 */

function bytes(...parts: Array<number[] | string>): Uint8Array {
  const flat = parts.flatMap((part) =>
    typeof part === "string" ? Array.from(part, (character) => character.charCodeAt(0)) : part,
  );
  return Uint8Array.from(flat);
}

const u16be = (value: number) => [(value >> 8) & 0xff, value & 0xff];
const u16le = (value: number) => [value & 0xff, (value >> 8) & 0xff];
const u24le = (value: number) => [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff];
const u32be = (value: number) => [...u16be(value >>> 16), ...u16be(value & 0xffff)];
const u32le = (value: number) => [...u16le(value & 0xffff), ...u16le(value >>> 16)];

/** The PNG signature and an IHDR chunk (8-bit RGBA), CRC left zero. */
export function pngHeader(width: number, height: number): Uint8Array {
  return bytes(
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    u32be(13),
    "IHDR",
    u32be(width),
    u32be(height),
    [8, 6, 0, 0, 0],
    [0, 0, 0, 0],
  );
}

/** SOI, a JFIF APP0 segment and a comment, then a start-of-frame, then the scan's marker. */
export function jpegHeader(
  width: number,
  height: number,
  { progressive = false }: { progressive?: boolean } = {},
): Uint8Array {
  return bytes(
    [0xff, 0xd8],
    [0xff, 0xe0],
    u16be(16),
    "JFIF\0",
    [1, 1, 0, 0, 1, 0, 1, 0, 0],
    // Fill bytes before a marker are allowed.
    [0xff, 0xff, 0xfe],
    u16be(6),
    "note",
    [0xff, progressive ? 0xc2 : 0xc0],
    u16be(17),
    [8],
    u16be(height),
    u16be(width),
    [3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1],
    [0xff, 0xda],
    u16be(12),
  );
}

function riff(chunk: string, payload: number[]): Uint8Array {
  return bytes(
    "RIFF",
    u32le(4 + 8 + payload.length),
    "WEBP",
    chunk,
    u32le(payload.length),
    payload,
  );
}

/** `VP8 `: a key frame's tag, start code, then 14-bit width and height. */
export function webpLossy(width: number, height: number): Uint8Array {
  return riff("VP8 ", [0x30, 0x01, 0x00, 0x9d, 0x01, 0x2a, ...u16le(width), ...u16le(height)]);
}

/** `VP8L`: its signature, then width - 1 and height - 1 in 14 bits each. */
export function webpLossless(width: number, height: number): Uint8Array {
  const bits = ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14);
  return riff("VP8L", [0x2f, ...u32le(bits >>> 0), 0, 0]);
}

/** `VP8X`: flags, then canvas width - 1 and height - 1 in 24 bits each. */
export function webpExtended(width: number, height: number): Uint8Array {
  return riff("VP8X", [0x10, 0, 0, 0, ...u24le(width - 1), ...u24le(height - 1)]);
}

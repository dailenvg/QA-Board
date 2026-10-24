import { crc32, deflateSync } from "node:zlib";

/** Brand-colored bands, 400px each, so scrolling a snapshot is easy to see in traces. */
const BANDS: ReadonlyArray<readonly [number, number, number]> = [
  [216, 252, 108],
  [12, 84, 204],
  [240, 84, 60],
  [72, 192, 240],
];
const BAND_HEIGHT = 400;

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

const cache = new Map<string, Buffer>();

/** A real PNG of a striped "page", standing in for a server-side capture. */
export function snapshotPng(width: number, height: number): Buffer {
  const key = `${width}x${height}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const stride = width * 3 + 1;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const [r, g, b] = BANDS[Math.floor(y / BAND_HEIGHT) % BANDS.length] ?? [0, 0, 0];
    for (let x = 0; x < width; x += 1) {
      const offset = y * stride + 1 + x * 3;
      pixels[offset] = r;
      pixels[offset + 1] = g;
      pixels[offset + 2] = b;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // truecolor
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  cache.set(key, png);
  return png;
}

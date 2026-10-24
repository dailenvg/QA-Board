/** Image types a share stores, recognised by their first bytes rather than a claimed type. */
const SIGNATURES: ReadonlyArray<{ type: string; test: (bytes: Uint8Array) => boolean }> = [
  {
    type: "image/png",
    test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  { type: "image/jpeg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    type: "image/gif",
    test: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38,
  },
  {
    type: "image/webp",
    test: (b) =>
      String.fromCharCode(b[0] ?? 0, b[1] ?? 0, b[2] ?? 0, b[3] ?? 0) === "RIFF" &&
      String.fromCharCode(b[8] ?? 0, b[9] ?? 0, b[10] ?? 0, b[11] ?? 0) === "WEBP",
  },
];

export function sniffImageType(bytes: Uint8Array): string | null {
  return SIGNATURES.find((signature) => signature.test(bytes))?.type ?? null;
}

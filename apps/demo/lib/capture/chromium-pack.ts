/** Pinned to the @sparticuz/chromium-min version in package.json; the unit test keeps them in step. */
export const CHROMIUM_VERSION = "153.0.0";

const RELEASES = "https://github.com/Sparticuz/chromium/releases/download";

/** Release packs exist for these Node architectures only. */
const PACK_ARCHES: ReadonlySet<string> = new Set(["arm64", "x64"]);

/**
 * Where @sparticuz/chromium-min downloads Chromium from on a cold start.
 * `SQUINT_CHROMIUM_PACK_URL` overrides the GitHub release, e.g. for a mirror closer to the functions.
 * It must be https: chromium-min reads anything that isn't a URL as a local folder.
 */
export function chromiumPackUrl(
  version: string,
  arch: string,
  env: Record<string, string | undefined>,
): string {
  const override = env.SQUINT_CHROMIUM_PACK_URL?.trim();
  if (override) {
    if (!URL.canParse(override) || new URL(override).protocol !== "https:") {
      throw new Error("SQUINT_CHROMIUM_PACK_URL must be an https URL.");
    }
    return override;
  }
  if (!PACK_ARCHES.has(arch)) throw new Error(`No Chromium pack for the ${arch} architecture.`);
  return `${RELEASES}/v${version}/chromium-v${version}-pack.${arch}.tar`;
}

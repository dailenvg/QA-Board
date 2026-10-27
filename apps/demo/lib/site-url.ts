/** Where Squint is served publicly. Other Vercel deployments sit behind Vercel's login. */
export const PRODUCTION_SITE_URL = "https://squintreview.com";

const LOCAL_SITE_URL = "http://localhost:3000";

/** Reads NEXT_PUBLIC_SITE_URL, VERCEL_ENV and VERCEL_URL. */
type SiteEnv = Readonly<Record<string, string | undefined>>;

/** `squint.example` or `https://squint.example`: hosts without a scheme get https. */
function withScheme(origin: string): URL {
  return new URL(/^https?:\/\//i.test(origin) ? origin : `https://${origin}`);
}

/**
 * The origin absolute links are built on (link preview images, Open Graph URLs):
 * `NEXT_PUBLIC_SITE_URL` when set, the custom domain on production builds, the
 * deployment's own host on other Vercel builds, and localhost everywhere else.
 */
export function siteUrl(env: SiteEnv = process.env): URL {
  const configured = env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return withScheme(configured);
  if (env.VERCEL_ENV === "production") return new URL(PRODUCTION_SITE_URL);
  const deployment = env.VERCEL_URL?.trim();
  if (deployment) return withScheme(deployment);
  return new URL(LOCAL_SITE_URL);
}

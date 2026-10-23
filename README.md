# pinpoint

Open source, self-hosted visual feedback for Vercel preview deployments.

Anyone with the preview URL and a review token can click on the page, drop a pinned comment, and it lands in the GitHub pull request for that branch. There are no accounts, no browser extension and no SaaS: the widget and the API run inside your own Next.js app.

| Package                               | What it is                                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------------------ |
| [`@pinpoint/widget`](packages/widget) | Drop-in React overlay. Framework-agnostic core, Next.js helper at `@pinpoint/widget/next`. |
| [`@pinpoint/server`](packages/server) | Route handlers plus storage adapters (GitHub, Postgres, memory).                           |
| [`apps/demo`](apps/demo)              | Next.js 15 landing page that uses both packages. Deploy it to Vercel to try pinpoint.      |

## How it works

```
 reviewer's browser                      your Next.js app (Vercel)                 GitHub
 ──────────────────                      ─────────────────────────                 ──────
 /?review=<token>
   │  token saved to localStorage (14 days), stripped from the URL
   ▼
 <PinpointProvider>  ── GET /api/pinpoint?path=/pricing ──▶  createPinpointHandler
   │ click an element                                          │ token check (timing-safe)
   │ selector + % offset + screenshot                          │ zod validation, rate limits
   └──────────── POST / PATCH /api/pinpoint ────────────────▶  StorageAdapter
                                                               ├─ GitHub ──────────▶ PR comment (one per pin)
                                                               │                     screenshot on `pinpoint-assets`
                                                               ├─ Postgres (+ optional GitHub mirror)
                                                               └─ memory (dev, tests)
```

1. **Activation.** The widget renders nothing unless it is enabled (by default only on Vercel preview deployments) and a review token is present. Without a token it makes zero network requests.
2. **Pinning.** Comment mode outlines the element under the cursor. A click (or Tab/arrow keys and Enter) drops a numbered pin. The pin stores a robust CSS selector for the element plus the click position as a percentage of that element's box, so it follows the element through scrolling, resizing and redeploys. If the element disappears, the pin falls back to its original viewport position and is marked as changed.
3. **Submitting.** The widget captures the visible viewport with `html-to-image`, marks the pin on it, and posts the comment together with viewport size, user agent and page path.
4. **Storage.** By default each pin becomes one comment on the open PR for the branch (or on a `[pinpoint] <branch>` issue when there is no PR). Replies and resolves edit that same comment. Pins are keyed by branch and page path, so they persist across redeploys of the same branch.
5. **Deep links.** Every pin has a link with `?pin=<id>`. Opening it scrolls to the pin and opens its thread.

## Quick start (Next.js App Router)

```sh
pnpm add @pinpoint/widget @pinpoint/server
```

Wrap the root layout:

```tsx
// app/layout.tsx
import { PinpointProvider } from "@pinpoint/widget/next";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PinpointProvider>{children}</PinpointProvider>
      </body>
    </html>
  );
}
```

Mount the route handler:

```ts
// app/api/pinpoint/route.ts
import { createGitHubStorage, createPinpointHandler } from "@pinpoint/server";

export const runtime = "nodejs";

export const { GET, POST, PATCH } = createPinpointHandler({
  storage: createGitHubStorage({
    token: process.env.GITHUB_TOKEN,
    repo: process.env.GITHUB_REPO!,
  }),
  // reviewToken defaults to process.env.PINPOINT_REVIEW_TOKEN
});
```

Set `PINPOINT_REVIEW_TOKEN`, `GITHUB_TOKEN` and `GITHUB_REPO` in the Vercel project, deploy a branch, then share:

```
https://<your-preview-url>/?review=<PINPOINT_REVIEW_TOKEN>
```

The demo app also ships a `/review-link` page that builds this link for you on previews.

### Widget props

| Prop       | Default                                                          | Notes                                                                                                                      |
| ---------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `enabled`  | `NEXT_PUBLIC_VERCEL_ENV === "preview"` (`/next`), `false` (core) | The core export never enables itself, so it cannot ship to production by accident.                                         |
| `endpoint` | `/api/pinpoint`                                                  | URL of the route handler.                                                                                                  |
| `client`   | HTTP client for `endpoint`                                       | Any `PinpointClient`, for example `createMemoryClient()` to try the UI without a server. Takes precedence over `endpoint`. |
| `branch`   | `NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF` (`/next`)                    | Shown in the toolbar only; the server decides the branch pins are stored under.                                            |
| `path`     | `location.pathname`                                              | Page path pins are keyed by. Client-side navigations are detected automatically.                                           |

### Handler options

`createPinpointHandler({ storage, ... })` returns Web-standard `GET`, `POST` and `PATCH` handlers.

| Option             | Default                                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------------------- |
| `storage`          | required: a `StorageAdapter`                                                                               |
| `reviewToken`      | `process.env.PINPOINT_REVIEW_TOKEN`. When missing, every request returns 500 with a configuration message. |
| `branch`           | `VERCEL_GIT_COMMIT_REF`, else `"local"`                                                                    |
| `deploymentUrl`    | `https://$VERCEL_URL`, else the request origin. Recorded on each pin.                                      |
| `linkBaseUrl`      | `https://$VERCEL_BRANCH_URL`, else the request origin. Origin for deep links.                              |
| `rateLimit`        | 10 POSTs per minute per IP. `false` disables it.                                                           |
| `authFailureLimit` | 20 failed auth attempts per 10 minutes per IP, across all methods. `false` disables it.                    |

Responses: `200`/`201` on success, `400` invalid input, `401` missing or wrong token, `404` unknown pin, `413` body or screenshot too large, `429` rate limited (with `Retry-After`), `500` misconfiguration or unexpected error. Every response is `Cache-Control: no-store`.

## Environment variables

| Variable                            | Where  | Required             | Purpose                                                           |
| ----------------------------------- | ------ | -------------------- | ----------------------------------------------------------------- |
| `PINPOINT_REVIEW_TOKEN`             | server | yes                  | Shared secret reviewers append as `?review=`.                     |
| `GITHUB_TOKEN`                      | server | for GitHub storage   | Token used to read and write PR comments and screenshots.         |
| `GITHUB_REPO`                       | server | for GitHub storage   | `owner/name` of the repository.                                   |
| `DATABASE_URL`                      | server | for Postgres storage | Connection string for `pg`.                                       |
| `NEXT_PUBLIC_VERCEL_ENV`            | client | set by Vercel        | `preview` enables the widget through `@pinpoint/widget/next`.     |
| `NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF` | client | set by Vercel        | Branch name shown in the toolbar.                                 |
| `VERCEL_GIT_COMMIT_REF`             | server | set by Vercel        | Branch pins are stored under.                                     |
| `VERCEL_URL`, `VERCEL_BRANCH_URL`   | server | set by Vercel        | Deployment URL recorded on pins and stable origin for deep links. |

`NEXT_PUBLIC_PINPOINT_REVIEW_TOKEN` is **not** needed and should not be set. The token arrives in the review link and is never baked into the client bundle.

The `NEXT_PUBLIC_VERCEL_*` variables are available when "Automatically expose System Environment Variables" is enabled in the Vercel project (the default).

Demo-only variables (see [`apps/demo/.env.example`](apps/demo/.env.example)):

| Variable                       | Purpose                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------- |
| `PINPOINT_RATE_LIMIT`          | POSTs per minute per IP (default 10).                                                 |
| `PINPOINT_ENABLE_REVIEW_LINK`  | `1` shows `/review-link` outside Vercel previews. For local development and e2e only. |
| `NEXT_PUBLIC_PINPOINT_ENABLED` | `1` forces the widget on outside Vercel previews.                                     |

The demo picks storage from the environment: GitHub when `GITHUB_TOKEN` and `GITHUB_REPO` are set, otherwise Postgres when `DATABASE_URL` is set, otherwise in-memory storage.

## GitHub token permissions

Use a fine-grained personal access token scoped to the one repository, with:

| Permission    | Access         | Used for                                                    |
| ------------- | -------------- | ----------------------------------------------------------- |
| Contents      | Read and write | Committing screenshots to the `pinpoint-assets` branch.     |
| Issues        | Read and write | Creating and editing comments, creating the fallback issue. |
| Pull requests | Read           | Finding the open PR for the branch.                         |
| Metadata      | Read           | Required by GitHub for every fine-grained token.            |

pinpoint only trusts comments authored by the token's own account, resolved once through `GET /user`. Comments from anyone else that contain a pinpoint block are ignored, so reviewers cannot forge pins by pasting the hidden JSON.

**GitHub App installation tokens** cannot call `GET /user`. Pass the app's bot login explicitly:

```ts
createGitHubStorage({ octokit, repo: process.env.GITHUB_REPO!, authorLogin: "my-app[bot]" });
```

## Screenshot storage

With GitHub storage, screenshots are committed to an orphan branch named `pinpoint-assets` through the Git Data API (blob, tree, commit, ref). The branch is created on first use with a parentless commit, so it never shares history with your code. Concurrent uploads that lose the ref update are retried.

- Path: `<branch-slug>/<pinId>.png`
- Link: `https://github.com/<owner>/<repo>/blob/pinpoint-assets/<path>?raw=true`
- In private repositories the link only opens for people who are signed in to GitHub and can read the repository. The inline image in the PR comment may not render there; the link always works for those readers.
- Screenshots are capped at 1.5 MB decoded. The widget downscales large captures before sending; the server rejects anything larger with 413.
- Pass `screenshots: false` to skip images, or your own `ScreenshotStore` (`{ save({ branch, pinId, screenshot }) => Promise<url> }`) to use Vercel Blob, S3 or similar.

## Postgres

```ts
import { createGitHubStorage, createPinpointHandler } from "@pinpoint/server";
import { createPostgresStorage, migrate } from "@pinpoint/server/postgres";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await migrate(pool); // idempotent; safe on every cold start

const storage = createPostgresStorage({
  pool,
  // Optional: copy every pin, reply and resolve to GitHub as well.
  mirror: createGitHubStorage({ token: process.env.GITHUB_TOKEN, repo: process.env.GITHUB_REPO! }),
});
```

- `pg` is an optional peer dependency; install it yourself.
- `migrate(pool)` records applied migrations in `pinpoint_migrations` and runs the SQL in [`packages/server/migrations`](packages/server/migrations). You can also apply `001_init.sql` with `psql -f` yourself.
- Tables: `pinpoint_pins` (indexed on `branch, path, created_at`) and `pinpoint_replies`.
- The mirror is one-way and best-effort: writes made through pinpoint are copied, mirror failures are logged and never fail the request, and edits made directly on GitHub are not synced back.
- Without its own `screenshots` store, the Postgres adapter adopts the screenshot URL produced by the mirror.

## Security model

- **The token gates the API, not the page.** Every API request must carry the review token in `x-pinpoint-token` (or `Authorization: Bearer`). It is compared in constant time. The pages themselves stay public unless you protect them.
- **`/review-link` exposes the token** to anyone who can load the preview deployment. Turn on [Vercel Deployment Protection](https://vercel.com/docs/security/deployment-protection) for previews of private work. The page returns 404 outside previews.
- **Token handling in the browser.** The token is read from `?review=`, stored in `localStorage` for 14 days, and removed from the address bar immediately. A 401 response clears it. Visiting a review link again refreshes it.
- **Silent without a token.** With no valid token the widget renders nothing and makes no requests. Outside preview deployments it is disabled entirely.
- **Rate limits are per instance.** POSTs are limited to 10 per minute per IP and failed auth to 20 per 10 minutes per IP, in memory. Each serverless instance keeps its own counters and they reset on cold start, so treat them as abuse dampening, not a hard guarantee.
- **Untrusted input.** Payloads are validated with zod. Names and comment bodies are HTML-encoded and Markdown-escaped before they reach GitHub, and @mentions are neutralised. The hidden JSON block escapes `<`, `>` and `&`, so user text cannot terminate it. Deep links are built from the server's own origin, never from a URL the client sends. Screenshots must be a single PNG or JPEG data URL whose bytes match the declared type.
- **Names are self-reported.** Everyone shares one token, so the author name on a pin is whatever the reviewer typed.

## Known limits

- Rate limiting is per serverless instance (see above).
- GitHub write races: two replies or resolves on the same pin at the same moment can overwrite each other. pinpoint re-reads the comment before every edit, but GitHub's REST API does not honour `If-Match` on comment updates, so there is no atomic compare-and-swap.
- The Postgres to GitHub mirror is one-way.
- Pull requests from forks are not matched; the PR lookup uses `owner:branch` of the configured repository.
- Screenshots do not correct for `position: fixed` elements, which can appear shifted, and cross-origin images that block CORS may render blank.
- A single pin thread is limited by GitHub's 65,536-character comment limit; replies beyond it return 413.
- `@pinpoint/server` ships ESM and CJS. The CJS build loads the ESM-only `@octokit/rest`, which needs Node.js 22.12 or later.

## Development

Requirements: Node.js 24 (22.12+ works), pnpm 11.

```sh
pnpm install
pnpm dev              # builds the packages, then runs the demo on http://localhost:3000
pnpm build            # widget, server, demo
pnpm lint
pnpm typecheck
pnpm test             # unit tests (Vitest), no browser needed
pnpm test:e2e         # Playwright against a production build of the demo
```

Before the first e2e run, install the browser: `pnpm --filter @pinpoint/demo exec playwright install chromium`.

For local development of the demo, copy `apps/demo/.env.example` to `apps/demo/.env.local`, set `PINPOINT_REVIEW_TOKEN` and `NEXT_PUBLIC_PINPOINT_ENABLED=1`, then open `http://localhost:3000/?review=<token>`. Without GitHub or Postgres variables the demo uses in-memory storage.

Repository layout:

```
packages/widget   @pinpoint/widget (tsup, Vitest + happy-dom)
packages/server   @pinpoint/server (tsup, Vitest)
apps/demo         Next.js 15 demo and Playwright e2e
```

The wire types live in `packages/widget/src/core/types.ts` and are mirrored in `packages/server/src/types.ts`. A typecheck-only contract test (`packages/server/test/contract.ts`) fails if the two drift apart.

## Contributing

Issues and pull requests are welcome. Please:

1. Use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages.
2. Run `pnpm lint`, `pnpm typecheck`, `pnpm test` and, for UI changes, `pnpm test:e2e`.
3. Add a changeset for changes to a published package: `pnpm changeset`.

## License

[MIT](LICENSE) © pinpoint contributors

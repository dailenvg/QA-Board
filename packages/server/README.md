# @pinpoint/server

Route handlers and storage adapters for pinpoint.

```ts
// app/api/pinpoint/route.ts
import { createGitHubStorage, createPinpointHandler } from "@pinpoint/server";

export const runtime = "nodejs";
export const { GET, POST, PATCH } = createPinpointHandler({
  storage: createGitHubStorage({ token: process.env.GITHUB_TOKEN, repo: process.env.GITHUB_REPO! }),
});
```

- Storage: `createGitHubStorage` (default), `createPostgresStorage` and `migrate` from `@pinpoint/server/postgres` (install `pg`), `createMemoryStorage` for development and tests.
- Requires Node.js 22.12 or later.

See the [root README](../../README.md) for token permissions, screenshot storage, Postgres setup, the security model and known limits.

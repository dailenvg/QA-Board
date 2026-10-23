# pinpoint demo

Next.js 15 landing page that wires `@pinpoint/widget` and `@pinpoint/server` together. Deploy it to Vercel, or run it locally:

```sh
cp .env.example .env.local   # set PINPOINT_REVIEW_TOKEN and NEXT_PUBLIC_PINPOINT_ENABLED=1
pnpm --filter @pinpoint/demo dev
```

Then open `http://localhost:3000/?review=<token>`. `/review-link` builds the shareable link on previews (or locally with `PINPOINT_ENABLE_REVIEW_LINK=1`).

E2E: `pnpm test:e2e` from the repository root (run `pnpm exec playwright install chromium` here first).

See the [root README](../../README.md) for the full documentation.

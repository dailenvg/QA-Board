# Squint (pinpoint demo)

Next.js 15 app with two jobs:

- **Squint**, a visual review tool. Paste a website address or upload an image to create a project inside a folder, then switch to Comment mode and click or tap to pin numbered comments. Comments can be edited, resolved, reopened and deleted, and the panel splits them into Active and Resolved. Each project shows a status: _Ready to review_, _Comments in_ or _Comments resolved_. On a website, comments pin to a full-page snapshot. Comments export as a ZIP, Markdown or JSON written for AI coding agents, and a single project can be shared with clients by link. There is no account. The workspace lives in this browser (data in `localStorage`, images in IndexedDB), and a project is only stored on the server when you share it with clients.
- **The pinpoint host**. It wires `@pinpoint/widget` and `@pinpoint/server` together, so preview deployments get the review widget on every page.

```sh
cp .env.example .env.local   # set PINPOINT_REVIEW_TOKEN and NEXT_PUBLIC_PINPOINT_ENABLED=1
pnpm --filter @pinpoint/demo dev
```

Squint runs without environment variables. Sharing and snapshots have optional ones, listed under [Environment](#environment). The other `.env.local` values are for the widget.

## Routes

| Route                   | What it is                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| `/`                     | Overview: every folder as a glass folder card holding its newest projects. Old `?folder=<id>` links redirect. |
| `/f/[id]`               | Folder: status filter and project cards. Unknown ids get a way back to the Overview.                          |
| `/p/[id]`               | Viewer: Browse or Comment mode (shortcut `C`), pins on the canvas, comments panel.                            |
| `/s/[token]`            | Shared review link for clients: view and add comments. No workspace links; `noindex`, no referrer.            |
| `/api/shares`           | Owner share API (owner key in `x-squint-owner-key`): create, push, pull, images, revoke.                      |
| `/api/s/[token]`        | Client share API: read, images, add a comment, share-scoped capture.                                          |
| `/sandbox`              | Static sample page to review in Squint. The widget e2e specs also run on it.                                  |
| `/api/frame-check?url=` | Reports whether a URL may be shown in an iframe here.                                                         |
| `/api/capture`          | `POST { url, width }`: full-page JPEG snapshot of a public website (page size in `x-capture-*` headers).      |
| `/review-link`          | Shareable widget link on previews (or locally with `PINPOINT_ENABLE_REVIEW_LINK=1`).                          |
| `/api/pinpoint`         | pinpoint widget API.                                                                                          |

Open `http://localhost:3000/sandbox?review=<token>` to try the widget.

## How Squint works

- **Storage.** Projects, folders and comments live under one versioned key, `squint:v2`, read through a `useSyncExternalStore` store (`lib/store`). Other tabs stay in sync through the `storage` event. If the browser blocks storage, Squint still works but nothing survives a reload. Unreadable data shows a recovery screen with a backup download instead of crashing. Writes that hit the storage quota are rejected and reported. Uploads (PNG, JPG, WebP or GIF, up to 15 MB) are downscaled to a 2400px longest edge and re-encoded as WebP or JPEG before they are saved. Images (uploads, snapshots, comment crops) live in IndexedDB. Data saved by earlier builds under `squint:v1`, with images inline, is migrated on load: the images move to IndexedDB, the data is saved as `squint:v2`, and `squint:v1` is removed. If an image can't be stored, `squint:v1` is left as it is, the visit runs unsaved, and the next load tries again. Builds from before the migration can't read `squint:v2`. The theme has its own key, `squint:theme`.
- **Overview.** `/` and `/f/[id]` share one layout, so the sidebar stays put and its active indicator glides between Overview and folders. Each folder card is one link to its folder page: click or tap the glass, the artwork or the Squint key. Hovering a folder, or tabbing into it, fans out its four newest projects, and each one links to the viewer. The `···` chip in the card's top-right corner renames or deletes the folder. A project created on the Overview drops into its folder and you stay put; the toast offers **Open**. Each folder gets one Native Pet product color from its place in the grid (`lib/brand-palette.ts`), shared by its generated artwork and its mascot, so no two folders in a row or column match. A folder's color can change when the column count changes or folders are added or removed; its art style and arrangement come from its id and stay the same.
- **Undo.** Deleting a project or a comment, and resolving a comment, shows a toast with **Undo**. Deleting a folder also deletes its projects and can't be undone.
- **Status.** Derived, never stored: no comments is _Ready to review_, any active comment is _Comments in_, and all comments resolved is _Comments resolved_.
- **Frame check.** Before a website loads, `/api/frame-check` fetches it server-side (HEAD, then GET when needed; 6s timeout; up to 4 redirects) and reads `X-Frame-Options` and CSP `frame-ancestors`. Only `http` and `https` are fetched. Every hop is resolved first, and the server won't fetch an address that points at a loopback, private, link-local or otherwise non-public network.
- **Screenshot fallback.** Sites that refuse framing, can't be reached, or don't load within 15 seconds get a fallback with **Upload a screenshot instead** (the project becomes an image and keeps the original URL) and **Open site in new tab**. When the server can't tell (for example a local address), the browser simply tries.
- **Snapshots.** On a website project, Browse shows the live iframe and Comment mode shows a full-page snapshot, taken server-side at the stage's width (`lib/capture`). Pins are placed on the snapshot, so they scroll with its content. **Refresh snapshot** takes a new one, and earlier comments stay on the snapshot they were placed on: their card says _Earlier snapshot_, and selecting one switches the stage to it. If the first capture fails, the stage says why and offers **Retry**; owners can also upload a screenshot instead. Snapshot and screenshot images live in IndexedDB (`lib/blob-store`), their metadata in `squint:v2`. An image is deleted a minute after nothing uses it anymore, so Undo still finds it.
- **Capture safety.** `/api/capture` accepts only `http` and `https` addresses and checks the address the same way the frame check does. Every connection the headless page makes, redirects and subresources included, goes through a per-capture proxy that refuses non-public addresses when it connects. Limits: width 320 to 2560 px, height 16,000 px (taller pages are cut off), image 4 MB (a bigger page is rendered at a smaller scale, which is recorded on the snapshot), 25 seconds per capture, two captures at a time per server instance, and ten requests per minute per IP. Locally it uses the Playwright Chromium from `pnpm exec playwright install chromium`; on Vercel, `@sparticuz/chromium`. With `SQUINT_CAPTURE_URL` set, captures go to an external service with the same contract instead (see [Environment](#environment)).
- **Comment screenshots.** Posting a comment saves a PNG of the part of the snapshot or image that was on screen, with the pin marked. It shows on the comment card and opens larger.
- **Export.** The viewer's **Export** menu downloads a ZIP, or the Markdown or JSON on its own (`lib/export`). The ZIP holds `comments.md`, `comments.json` and `screenshots/<NN>-<id>.png`, plus the full-page snapshots the comments sit on in `snapshots/` (up to 40 MB in total; the rest are listed as left out), or the source image for image projects. The Markdown is written for AI coding agents: a short header on how to use it, then one section per comment, active ones first. The JSON follows the versioned schema `squint.comments/1`. Files are named `<project-slug>-comments-<yyyy-mm-dd>.<ext>`. Export is disabled, with the reason shown, until the project has a comment.
- **Sharing.** **Share** in the viewer creates a share link (`/s/<token>`) to one project and uploads a copy of it to the server. The owner's workspace stays in their browser.
  - **Clients** see every pin and comment, can browse, take snapshots of the project's own address (never an address they choose), and add comments with screenshots. They can't resolve, edit, delete or move anything. They can export what they see (ZIP, Markdown, JSON). The page has no links into a workspace, is `noindex`, and sends no referrer.
  - **Sync.** The owner's viewer pushes every change to the server and pulls client comments on open, every 15 seconds while the tab is visible, and on focus. The owner's copy wins. The client's view refreshes on the same schedule.
  - **Revoke.** **Revoke link** deletes the server copy, and the link answers 404. Sharing again creates a new link. Deleting a shared project, or a folder holding shared projects, revokes its link once the delete is final (when Undo is no longer offered). A revoke that fails is kept in `squint:v2` and retried until the server confirms it.
  - **Unsent comments.** A comment that fails to post keeps the composer open with its text, an inline error and **Retry**, and its pin is marked unsent. Sending again reuses the comment's id, so it can't post twice.
  - **Security.** The share token and the owner key are 32 random bytes each; the server stores only their SHA-256 hashes and compares them in constant time. The owner key travels in `x-squint-owner-key`. The server enforces who can do what; the UI only reflects it. Client writes are rate limited per IP: 20 comments and 6 captures a minute.
  - **Storage.** Shares live in Postgres when `DATABASE_URL` is set. Otherwise they live in the server's memory, one copy per instance, lost on restart: that is for local use only. Images go to Vercel Blob (private) when `BLOB_READ_WRITE_TOKEN` is set, otherwise into the share store, and are only served through token-gated routes (`lib/share`, `lib/share-client`). No request or response carries more than 4 MB of image, since Vercel Functions stop at 4.5 MB: bigger images upload in parts and download in byte ranges.
- **Pin anchoring.** Pins are stored as percentages of their surface: a snapshot, or the image. Website comments from before snapshots are anchored to the visible frame instead, shown only in Browse mode and labelled _Live page_.

## Environment

Squint reads three optional variables. Copy `.env.example` to `.env.local` to set them locally.

| Variable                | When set                                                                     | When unset                                                                         |
| ----------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `DATABASE_URL`          | Shares are stored in Postgres (tables `squint_*`, migrated on first use).    | Shares live in the server's memory, per instance, lost on restart. Local use only. |
| `BLOB_READ_WRITE_TOKEN` | Shared images go to Vercel Blob as private blobs.                            | Shared images are stored with the share's data.                                    |
| `SQUINT_CAPTURE_URL`    | Captures go to this external service (same contract as `POST /api/capture`). | Captures run on this server in headless Chromium.                                  |

Blob URLs never reach a browser: images are served through token-gated routes either way. `DATABASE_URL` is shared with the pinpoint server, which uses it for its own storage when the GitHub variables aren't set. With `SQUINT_CAPTURE_URL`, Squint still checks the top-level address, but the external service has to refuse private addresses for redirects and subresources itself.

## Known limits

- **Signed-out captures.** Snapshots are taken server-side, so pages behind a login are captured signed out, and personalized or location-dependent content may differ from what a reviewer sees.
- **Snapshot size.** Captures are scaled down as needed to stay under 4 MB, so a long or detailed page can come out at a lower resolution. Pages taller than 16,000 px are cut off.
- **Per-instance limits.** Rate limits and the two-captures-at-a-time cap are kept in memory, so they apply per server instance, not across a deployment.
- **Untested backends.** Postgres storage has only been tested on PGlite (Postgres compiled to WebAssembly, used in the unit tests), not on a hosted Postgres server. Vercel Blob storage hasn't been tested against a live store.
- **Public capture endpoint.** `/api/capture` is public: anyone can ask it for a snapshot of a public site. It is guarded by the address checks and rate limits above, not by authentication.
- **Cold starts.** On Vercel, the first capture on a new instance is slower while Chromium starts.
- **Share size.** A share holds up to 40 MB of images: 2 MB per comment screenshot, 8 MB per snapshot and 15 MB for an uploaded image.

## Tests

`pnpm test:e2e` from the repository root (run `pnpm exec playwright install chromium` here first). The suite builds into `.next-e2e` and runs on desktop Chrome and a Pixel 7 profile. Squint specs mock `/api/frame-check` and `/api/capture`, so they never touch the network. `pnpm test` runs the unit tests (Vitest).

See the [root README](../../README.md) for the full pinpoint documentation.

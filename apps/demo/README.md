# Squint (pinpoint demo)

Next.js 15 app with two jobs:

- **Squint**, a visual review tool. Paste a website address or upload an image to create a project inside a folder, then switch to Comment mode and click or tap to pin numbered comments. Comments can be edited, resolved, reopened and deleted, and the panel splits them into Active and Resolved. Each project shows a status: _Ready to review_, _Comments in_ or _Comments resolved_. There is no account or backend: everything lives in this browser: data in `localStorage`, images in IndexedDB.
- **The pinpoint host**. It wires `@pinpoint/widget` and `@pinpoint/server` together, so preview deployments get the review widget on every page.

```sh
cp .env.example .env.local   # set PINPOINT_REVIEW_TOKEN and NEXT_PUBLIC_PINPOINT_ENABLED=1
pnpm --filter @pinpoint/demo dev
```

Squint itself needs no environment variables. The `.env.local` values are only for the widget.

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
- **Snapshots.** On a website project, Browse shows the live iframe and Comment mode shows a full-page snapshot taken server-side at the stage's width (`lib/capture`). Pins are placed on the snapshot, so they scroll with its content. **Refresh snapshot** takes a new one; comments keep pointing at the snapshot they were placed on. Snapshot and crop images live in IndexedDB (`lib/blob-store`), their metadata in `squint:v2`. Unreferenced images are deleted a minute after they stop being used, so Undo still finds them.
- **Capture safety.** `/api/capture` accepts only `http` and `https`, checks the address like the frame check, and sends every connection the headless page makes (redirects and subresources included) through a per-capture proxy that refuses non-public addresses at connect time. Width is clamped to 320 to 2560 px, height to 16,000 px, and the JPEG to 4 MB (a page that would be bigger is rendered at a smaller scale, recorded on the snapshot), each capture to 25 seconds, two at a time per server, ten per minute per IP. Locally it uses the Playwright Chromium from `pnpm exec playwright install chromium`; on Vercel, `@sparticuz/chromium`. `SQUINT_CAPTURE_URL` hands capture to an external service with the same contract.
- **Comment screenshots.** Posting a comment saves a PNG of the part of the snapshot or image on screen, with the pin marked. It shows on the comment card and opens larger.
- **Export.** The viewer's **Export** menu downloads a ZIP (`comments.md`, `comments.json`, `screenshots/<NN>-<id>.png`, plus the full-page snapshots in `snapshots/` up to 40 MB, or the source image for image projects), or the Markdown or JSON alone (`lib/export`). The Markdown is written as a task list for AI coding agents; the JSON follows the versioned schema `squint.comments/1`. Files are named `<project-slug>-comments-<yyyy-mm-dd>.<ext>`. Export is unavailable until a project has a comment.
- **Sharing.** **Share** in the viewer creates a link (`/s/<token>`) to one project. Clients see every pin and comment, can browse, take snapshots of the project's own address, and add comments with screenshots; they can't resolve, edit, delete or move anything, and they can export what they see (Markdown, JSON, ZIP). The owner's viewer sends every change to the server and pulls client comments on open, every 15 seconds while visible, and on focus; the owner's copy wins. **Revoke link** deletes the server copy, and the link answers 404. Deleting a shared project (or a folder holding shared projects) revokes its link once the delete is final, when Undo is no longer offered; a revoke that fails is kept in `squint:v2` and retried until the server confirms. A comment that fails to post keeps its composer open with the text, an inline error and Retry, and an unsent pin. The share token and owner key are 32 random bytes; the server stores only their SHA-256 hashes. Shares live in Postgres when `DATABASE_URL` is set, otherwise in the server's memory (one copy per instance, lost on restart: local use only). Images go to Vercel Blob (private) when `BLOB_READ_WRITE_TOKEN` is set, otherwise into the store, and are only served through token-gated routes (`lib/share`, `lib/share-client`). No request or response carries more than 4 MB of image (Vercel Functions stop at 4.5 MB): bigger images upload in parts and download in byte ranges.
- **Pin anchoring.** Pins are stored as percentages of their surface: a snapshot, or the image. Website comments from before snapshots are anchored to the visible frame instead, shown only in Browse mode and labelled _Live page_.

## Tests

`pnpm test:e2e` from the repository root (run `pnpm exec playwright install chromium` here first). The suite builds into `.next-e2e` and runs on desktop Chrome and a Pixel 7 profile. Squint specs mock `/api/frame-check` and `/api/capture`, so they never touch the network. `pnpm test` runs the unit tests (Vitest).

See the [root README](../../README.md) for the full pinpoint documentation.

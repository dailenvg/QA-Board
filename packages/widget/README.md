# @pinpoint/widget

Drop-in React overlay for leaving pinned visual feedback on preview deployments. Styles are isolated in a shadow root; the only runtime dependency is `html-to-image` (React and React DOM are peers).

```tsx
// Next.js App Router: app/layout.tsx
import { PinpointProvider } from "@pinpoint/widget/next";

<PinpointProvider>{children}</PinpointProvider>;
```

- `@pinpoint/widget/next` enables itself on Vercel previews (`NEXT_PUBLIC_VERCEL_ENV === "preview"`) and shows the branch name.
- `@pinpoint/widget` is framework-agnostic and stays disabled unless you pass `enabled`.
- `createMemoryClient()` lets you try the UI with no server: `<PinpointProvider enabled client={createMemoryClient()} />`.

Nothing renders and no requests are made until the page is opened with `?review=<token>`.

See the [root README](../../README.md) for setup, props, environment variables and the security model.

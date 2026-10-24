# Squint mascot

The Squint icon mark isolated from the logo and rigged as an interactive, code-animated character (React + Framer Motion).

## Run

```bash
npm install
npm run dev
```

Opens a playground at http://localhost:5178 with every mood, a chat demo and size tests.

## Files

| Path | What it is |
|------|------------|
| `public/squint-mark.svg` | Static isolated mark, square 420×420 crop, body and eyes on separate layers |
| `src/mascot/` | Drop-in component folder (needs `framer-motion`) |
| `src/mascot/paths.ts` | Vector data and brand colors |
| `src/mascot/moods.ts` | Mood definitions: pose, loop keyframes, eye shapes, gaze |
| `src/mascot/hooks.ts` | `useBlink` and `useGaze` (pointer tracking with idle wandering) |
| `src/mascot/MoodProps.tsx` | Thought bubbles, snores, sparkles |
| `src/lib/motion.ts` | Shared motion tokens |

## Usage

```tsx
import { SquintMascot } from "./mascot";

<SquintMascot
  mood="thinking"   // idle | listening | thinking | talking | happy | surprised | sleeping | resolved
  size={160}        // px number or CSS length
  followCursor      // eyes track the pointer
  draggable         // pick up and fling, springs home
  onPoke={() => {}} // makes it a button: squash + wink on click, Enter or Space
  color="#435DE6"   // optional body color
/>
```

## Behavior

- `resolved` is the confirmation state (for example when a comment is resolved): a celebration hop with a confetti burst and a check badge, repeating every 2.4s. Set it, then return to another mood after about 2.4s for a one-shot celebration.
- Blinks at irregular intervals, with the occasional double blink.
- Eyes follow the pointer anywhere on the page; the body leans slightly toward the gaze. After 4s without input it glances around on its own.
- Mood changes spring into the new pose before its loop starts, so switching never jumps.
- Hover or keyboard focus perks it up; dragging makes it wide-eyed and swing with the drag velocity.
- `prefers-reduced-motion`: loops, lean and swing are turned off; moods become static poses and blinking stays.

## Adding a mood

Add a name to `MOODS` and a spec to `MOOD_SPECS` in `moods.ts`. Each layer (`float`, `squash`, `eyes`, `shadow`) takes static values or keyframe arrays that start at the resting pose.

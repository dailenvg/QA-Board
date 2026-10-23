/**
 * Stylesheet injected into the widget's shadow root. Visual direction:
 * a precise, minimal instrument. Neutral surfaces, one signal-orange accent,
 * soft elevation, large consistent radii. Only transform and opacity animate.
 */
export const EXIT_DURATION_MS = 180;

export const WIDGET_CSS = /* css */ `
:host {
  all: initial;
}

.pp-root {
  --pp-accent: #c2410c;
  --pp-accent-hover: #b8360b;
  --pp-accent-press: #9f2f0a;
  --pp-on-accent: #ffffff;
  --pp-accent-soft: rgb(194 65 12 / 0.1);
  --pp-accent-ring: rgb(194 65 12 / 0.28);
  --pp-surface: #ffffff;
  --pp-surface-2: #f6f6f4;
  --pp-surface-3: #ececea;
  --pp-text: #18181a;
  --pp-text-muted: #5f5f5a;
  --pp-border: rgb(24 24 26 / 0.08);
  --pp-border-strong: rgb(24 24 26 / 0.18);
  --pp-danger: #b42318;
  --pp-danger-soft: rgb(180 35 24 / 0.1);
  --pp-inverse: #18181a;
  --pp-on-inverse: #f4f4f2;
  --pp-shadow-1: 0 1px 2px rgb(0 0 0 / 0.06), 0 2px 8px rgb(0 0 0 / 0.08);
  --pp-shadow-2: 0 2px 6px rgb(0 0 0 / 0.06), 0 16px 40px rgb(0 0 0 / 0.16);

  --pp-radius-sm: 8px;
  --pp-radius-md: 14px;
  --pp-radius-lg: 22px;
  --pp-radius-pill: 999px;

  --pp-space-1: 4px;
  --pp-space-2: 8px;
  --pp-space-3: 12px;
  --pp-space-4: 16px;
  --pp-space-5: 20px;

  --pp-text-xs: 12px;
  --pp-text-sm: 13px;
  --pp-text-md: 14px;
  --pp-text-lg: 16px;

  --pp-font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial,
    sans-serif;
  --pp-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;

  --pp-dur-fast: 150ms;
  --pp-dur: 220ms;
  --pp-dur-slow: 300ms;
  --pp-ease: cubic-bezier(0.2, 0.8, 0.2, 1);
  --pp-ease-spring: cubic-bezier(0.34, 1.4, 0.64, 1);

  --pp-edge: max(16px, env(safe-area-inset-right));
  --pp-edge-bottom: max(16px, env(safe-area-inset-bottom));

  position: absolute;
  inset: 0;
  font-family: var(--pp-font);
  font-size: var(--pp-text-md);
  line-height: 1.45;
  color: var(--pp-text);
  -webkit-font-smoothing: antialiased;
}

@media (prefers-color-scheme: dark) {
  .pp-root {
    --pp-accent: #ff8a4c;
    --pp-accent-hover: #ff9d66;
    --pp-accent-press: #ff7a3d;
    --pp-on-accent: #1a0f0a;
    --pp-accent-soft: rgb(255 138 76 / 0.14);
    --pp-accent-ring: rgb(255 138 76 / 0.35);
    --pp-surface: #1e1e20;
    --pp-surface-2: #27272a;
    --pp-surface-3: #323236;
    --pp-text: #f4f4f2;
    --pp-text-muted: #a3a39c;
    --pp-border: rgb(255 255 255 / 0.08);
    --pp-border-strong: rgb(255 255 255 / 0.18);
    --pp-danger: #ff8f85;
    --pp-danger-soft: rgb(255 143 133 / 0.14);
    --pp-inverse: #f4f4f2;
    --pp-on-inverse: #18181a;
    --pp-shadow-1: 0 1px 2px rgb(0 0 0 / 0.4), 0 2px 8px rgb(0 0 0 / 0.35);
    --pp-shadow-2: 0 2px 6px rgb(0 0 0 / 0.4), 0 16px 40px rgb(0 0 0 / 0.5);
  }
}

.pp-root *,
.pp-root *::before,
.pp-root *::after {
  box-sizing: border-box;
}

.pp-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

/* Buttons ---------------------------------------------------------------- */

.pp-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--pp-space-2);
  min-width: 44px;
  min-height: 44px;
  padding: 0 var(--pp-space-4);
  border: 0;
  border-radius: var(--pp-radius-pill);
  background: transparent;
  color: var(--pp-text);
  font: 500 var(--pp-text-md) / 1 var(--pp-font);
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  transition:
    transform var(--pp-dur-fast) var(--pp-ease),
    opacity var(--pp-dur-fast) var(--pp-ease);
}

.pp-btn:hover:not(:disabled, [aria-disabled="true"]) {
  background: var(--pp-surface-2);
}

.pp-btn:active:not(:disabled, [aria-disabled="true"]) {
  transform: scale(0.97);
}

.pp-btn:focus-visible,
.pp-input:focus-visible,
.pp-choice input:focus-visible + span,
.pp-pin:focus-visible .pp-pin__badge {
  outline: 2px solid var(--pp-accent);
  outline-offset: 2px;
}

.pp-btn:disabled,
.pp-btn[aria-disabled="true"] {
  opacity: 0.45;
  cursor: not-allowed;
}

.pp-btn--icon {
  padding: 0;
}

.pp-btn--primary,
.pp-btn[aria-pressed="true"].pp-btn--toggle-primary {
  background: var(--pp-accent);
  color: var(--pp-on-accent);
}

.pp-btn--primary:hover:not(:disabled, [aria-disabled="true"]),
.pp-btn[aria-pressed="true"].pp-btn--toggle-primary:hover {
  background: var(--pp-accent-hover);
}

.pp-btn--primary:active:not(:disabled, [aria-disabled="true"]),
.pp-btn[aria-pressed="true"].pp-btn--toggle-primary:active {
  background: var(--pp-accent-press);
}

.pp-btn--secondary {
  background: var(--pp-surface-2);
}

.pp-btn--secondary:hover:not(:disabled) {
  background: var(--pp-surface-3);
}

.pp-btn[aria-pressed="true"]:not(.pp-btn--toggle-primary) {
  background: var(--pp-accent-soft);
  color: var(--pp-accent);
}

.pp-icon {
  width: 18px;
  height: 18px;
  flex: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
}

/* Toolbar ---------------------------------------------------------------- */

.pp-toolbar {
  position: fixed;
  right: var(--pp-edge);
  bottom: var(--pp-edge-bottom);
  z-index: 3;
  display: flex;
  align-items: center;
  gap: var(--pp-space-1);
  max-width: calc(100vw - 2 * var(--pp-edge));
  padding: var(--pp-space-1);
  border: 1px solid var(--pp-border);
  border-radius: var(--pp-radius-pill);
  background: var(--pp-surface);
  box-shadow: var(--pp-shadow-2);
  pointer-events: auto;
  animation: pp-rise var(--pp-dur-slow) var(--pp-ease) backwards;
}

.pp-count {
  display: inline-grid;
  place-items: center;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: var(--pp-radius-pill);
  background: var(--pp-accent-soft);
  color: var(--pp-accent);
  font: 600 var(--pp-text-xs) / 1 var(--pp-font);
  font-variant-numeric: tabular-nums;
}

.pp-btn[aria-pressed="true"] .pp-count {
  background: rgb(255 255 255 / 0.22);
  color: inherit;
}

.pp-skeleton {
  display: inline-block;
  width: 22px;
  height: 22px;
  border-radius: var(--pp-radius-pill);
  background: var(--pp-surface-3);
  animation: pp-pulse 1.2s ease-in-out infinite;
}

.pp-divider {
  width: 1px;
  height: 24px;
  margin: 0 var(--pp-space-1);
  background: var(--pp-border-strong);
}

.pp-branch {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 160px;
  min-height: 44px;
  padding: 0 var(--pp-space-2);
  color: var(--pp-text-muted);
  font: 500 var(--pp-text-xs) / 1 var(--pp-mono);
}

.pp-branch__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pp-status-error {
  display: inline-flex;
  align-items: center;
  gap: var(--pp-space-1);
  padding-left: var(--pp-space-2);
  color: var(--pp-danger);
  font-size: var(--pp-text-sm);
  font-weight: 500;
}

@media (max-width: 479px) {
  .pp-branch,
  .pp-divider--branch,
  .pp-label-wide {
    display: none;
  }
}

/* Floating bubbles (hint, help) ----------------------------------------- */

.pp-bubble {
  position: fixed;
  right: var(--pp-edge);
  bottom: calc(var(--pp-edge-bottom) + 64px);
  z-index: 3;
  width: max-content;
  max-width: min(340px, calc(100vw - 2 * var(--pp-edge)));
  padding: var(--pp-space-3) var(--pp-space-4);
  border-radius: var(--pp-radius-md);
  background: var(--pp-inverse);
  color: var(--pp-on-inverse);
  box-shadow: var(--pp-shadow-2);
  font-size: var(--pp-text-sm);
  line-height: 1.5;
  pointer-events: none;
  animation: pp-rise var(--pp-dur) var(--pp-ease) both;
}

.pp-bubble strong {
  font-weight: 600;
}

.pp-bubble p {
  margin: 0;
}

.pp-bubble p + p,
.pp-bubble ol {
  margin-top: var(--pp-space-2);
}

.pp-bubble ol {
  margin-bottom: 0;
  padding-left: 18px;
}

.pp-kbd {
  display: inline-block;
  min-width: 20px;
  padding: 1px 5px;
  border-radius: 5px;
  background: rgb(127 127 127 / 0.28);
  font: 500 var(--pp-text-xs) / 1.4 var(--pp-mono);
  text-align: center;
}

/* Hover outline ---------------------------------------------------------- */

.pp-outline {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 1;
  border: 2px solid var(--pp-accent);
  border-radius: 6px;
  background: var(--pp-accent-soft);
  pointer-events: none;
  animation: pp-fade var(--pp-dur-fast) var(--pp-ease) both;
}

.pp-outline__label {
  position: absolute;
  bottom: calc(100% + 4px);
  left: -2px;
  padding: 2px 6px;
  border-radius: 6px;
  background: var(--pp-accent);
  color: var(--pp-on-accent);
  font: 600 11px / 1.4 var(--pp-mono);
  white-space: nowrap;
}

.pp-outline--below .pp-outline__label {
  top: calc(100% + 4px);
  bottom: auto;
}

/* Pins ------------------------------------------------------------------- */

.pp-pin {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 2;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  pointer-events: auto;
  -webkit-tap-highlight-color: transparent;
}

.pp-pin__badge {
  position: absolute;
  top: 8px;
  left: 8px;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 2px solid var(--pp-surface);
  border-radius: 14px 14px 14px 3px;
  background: var(--pp-accent);
  color: var(--pp-on-accent);
  box-shadow: var(--pp-shadow-1);
  font: 700 var(--pp-text-xs) / 1 var(--pp-font);
  font-variant-numeric: tabular-nums;
  transform-origin: bottom left;
  transition: transform var(--pp-dur-fast) var(--pp-ease);
  animation: pp-pop var(--pp-dur) var(--pp-ease-spring) both;
}

.pp-pin:hover .pp-pin__badge {
  transform: scale(1.08);
}

.pp-pin:active .pp-pin__badge {
  transform: scale(0.96);
}

.pp-pin--detached .pp-pin__badge {
  border: 2px dashed var(--pp-accent);
  background: var(--pp-surface);
  color: var(--pp-accent);
}

.pp-pin--resolved .pp-pin__badge {
  background: var(--pp-surface-3);
  color: var(--pp-text-muted);
}

.pp-pin--pending .pp-pin__badge::after {
  content: "";
  position: absolute;
  inset: -6px;
  border: 2px solid var(--pp-accent-ring);
  border-radius: inherit;
  animation: pp-ring 1.4s var(--pp-ease) infinite;
}

/* Popover ---------------------------------------------------------------- */

.pp-popover {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 4;
  width: min(340px, calc(100vw - 24px));
  pointer-events: auto;
}

.pp-popover__panel {
  display: flex;
  flex-direction: column;
  gap: var(--pp-space-3);
  max-height: min(560px, calc(100vh - 24px));
  overflow: auto;
  overscroll-behavior: contain;
  padding: var(--pp-space-4);
  border: 1px solid var(--pp-border);
  border-radius: var(--pp-radius-lg);
  background: var(--pp-surface);
  box-shadow: var(--pp-shadow-2);
  animation: pp-enter var(--pp-dur) var(--pp-ease) both;
}

.pp-popover[data-side="top"] .pp-popover__panel {
  animation-name: pp-enter-up;
}

.pp-popover[data-state="closed"] {
  pointer-events: none;
}

.pp-popover[data-state="closed"] .pp-popover__panel {
  animation: pp-exit ${EXIT_DURATION_MS}ms var(--pp-ease) both;
}

.pp-popover__header {
  display: flex;
  align-items: center;
  gap: var(--pp-space-2);
  min-height: 32px;
}

.pp-popover__title {
  flex: 1;
  margin: 0;
  font-size: var(--pp-text-lg);
  font-weight: 600;
  letter-spacing: -0.01em;
}

.pp-popover__close {
  margin: -6px -8px -6px 0;
}

.pp-number {
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 12px 12px 12px 3px;
  background: var(--pp-accent);
  color: var(--pp-on-accent);
  font: 700 var(--pp-text-xs) / 1 var(--pp-font);
  flex: none;
}

/* Forms ------------------------------------------------------------------ */

.pp-form {
  display: flex;
  flex-direction: column;
  gap: var(--pp-space-3);
  margin: 0;
}

.pp-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  border: 0;
  min-width: 0;
}

.pp-label {
  padding: 0;
  color: var(--pp-text);
  font-size: var(--pp-text-sm);
  font-weight: 600;
}

legend.pp-label {
  margin-bottom: 6px;
}

.pp-label__hint {
  color: var(--pp-text-muted);
  font-weight: 400;
}

.pp-input {
  width: 100%;
  min-height: 44px;
  padding: 10px 12px;
  border: 1px solid var(--pp-border-strong);
  border-radius: var(--pp-radius-md);
  background: var(--pp-surface);
  color: var(--pp-text);
  font: 400 var(--pp-text-lg) / 1.4 var(--pp-font);
  transition: box-shadow var(--pp-dur-fast) var(--pp-ease);
}

.pp-input::placeholder {
  color: var(--pp-text-muted);
}

.pp-input:hover {
  border-color: var(--pp-text-muted);
}

.pp-input:focus-visible {
  border-color: var(--pp-accent);
  box-shadow: 0 0 0 3px var(--pp-accent-ring);
  outline: none;
}

.pp-input[aria-invalid="true"] {
  border-color: var(--pp-danger);
}

.pp-input:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

textarea.pp-input {
  min-height: 64px;
  resize: vertical;
}

.pp-field-error,
.pp-form-error {
  margin: 0;
  color: var(--pp-danger);
  font-size: var(--pp-text-sm);
}

.pp-form-error {
  padding: var(--pp-space-2) var(--pp-space-3);
  border-radius: var(--pp-radius-sm);
  background: var(--pp-danger-soft);
}

.pp-choices {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 2px;
  padding: 2px;
  border-radius: var(--pp-radius-md);
  background: var(--pp-surface-2);
}

.pp-choice {
  position: relative;
  display: block;
  cursor: pointer;
}

.pp-choice input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.pp-choice span {
  display: grid;
  place-items: center;
  min-height: 44px;
  border-radius: 12px;
  color: var(--pp-text-muted);
  font-size: var(--pp-text-sm);
  font-weight: 500;
  transition: transform var(--pp-dur-fast) var(--pp-ease);
}

.pp-choice:hover span {
  color: var(--pp-text);
}

.pp-choice:active span {
  transform: scale(0.97);
}

.pp-choice input:checked + span {
  background: var(--pp-surface);
  color: var(--pp-text);
  box-shadow: var(--pp-shadow-1);
}

.pp-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--pp-space-2);
}

/* Thread ----------------------------------------------------------------- */

.pp-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  color: var(--pp-text-muted);
  font-size: var(--pp-text-xs);
}

.pp-author {
  color: var(--pp-text);
  font-size: var(--pp-text-sm);
  font-weight: 600;
}

.pp-tag {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 0 8px;
  border-radius: var(--pp-radius-pill);
  background: var(--pp-surface-2);
  color: var(--pp-text-muted);
  font-size: var(--pp-text-xs);
  font-weight: 600;
}

.pp-tag--must {
  background: var(--pp-danger-soft);
  color: var(--pp-danger);
}

.pp-tag--should,
.pp-tag--resolved {
  background: var(--pp-accent-soft);
  color: var(--pp-accent);
}

.pp-message {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.pp-message__body {
  margin: 0;
  font-size: var(--pp-text-md);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.pp-replies {
  display: flex;
  flex-direction: column;
  gap: var(--pp-space-3);
  margin: 0;
  padding: 0 0 0 var(--pp-space-3);
  border-left: 2px solid var(--pp-border-strong);
  list-style: none;
}

.pp-notice {
  margin: 0;
  padding: var(--pp-space-2) var(--pp-space-3);
  border-radius: var(--pp-radius-sm);
  background: var(--pp-surface-2);
  color: var(--pp-text-muted);
  font-size: var(--pp-text-sm);
}

.pp-screenshot {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 10;
  border: 1px solid var(--pp-border);
  border-radius: var(--pp-radius-md);
  object-fit: cover;
  object-position: top left;
  background: var(--pp-surface-2);
}

.pp-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--pp-space-2);
}

/* Motion ----------------------------------------------------------------- */

@keyframes pp-fade {
  from {
    opacity: 0;
  }
}

@keyframes pp-rise {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}

@keyframes pp-enter {
  from {
    opacity: 0;
    transform: translateY(-6px) scale(0.98);
  }
}

@keyframes pp-enter-up {
  from {
    opacity: 0;
    transform: translateY(6px) scale(0.98);
  }
}

@keyframes pp-exit {
  to {
    opacity: 0;
    transform: scale(0.98);
  }
}

@keyframes pp-pop {
  from {
    opacity: 0;
    transform: scale(0.5);
  }
}

@keyframes pp-ring {
  0% {
    opacity: 0.9;
    transform: scale(0.85);
  }
  100% {
    opacity: 0;
    transform: scale(1.35);
  }
}

@keyframes pp-pulse {
  50% {
    opacity: 0.45;
  }
}

@media (prefers-reduced-motion: reduce) {
  .pp-root *,
  .pp-root *::after {
    transition-duration: 1ms !important;
  }

  .pp-toolbar,
  .pp-bubble,
  .pp-popover__panel,
  .pp-popover[data-side="top"] .pp-popover__panel,
  .pp-pin__badge {
    animation-name: pp-fade;
  }

  .pp-popover[data-state="closed"] .pp-popover__panel {
    animation-name: pp-fade;
    animation-direction: reverse;
  }

  .pp-pin--pending .pp-pin__badge::after,
  .pp-skeleton {
    animation: none;
  }

  .pp-btn:active:not(:disabled, [aria-disabled="true"]),
  .pp-pin:hover .pp-pin__badge,
  .pp-pin:active .pp-pin__badge,
  .pp-choice:active span {
    transform: none;
  }
}
`;

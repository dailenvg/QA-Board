"use client";

import Link from "next/link";
import { useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { fanSlot, type ArtRecipe } from "./art";
import { ArtCanvas } from "./ArtCanvas";
import { FolderSheet, type FolderFile } from "./FolderSheet";
import {
  BACK_PATH,
  FRONT_H,
  FRONT_PATH,
  FRONT_TOP,
  FROST_PAD,
  H,
  HEADROOM,
  HINGE_OPEN,
  MAX_VISIBLE,
  W,
  frostPath,
} from "./geometry";
import { useMediaQuery } from "@/lib/use-media-query";
import { useEntrance, usePointerParallax } from "./hooks";
import { useArrivals } from "./use-arrivals";
import "./glass-folder.css";

export type { FolderFile } from "./FolderSheet";

/** The art canvas overhangs the back panel so parallax never shows its edge. */
const ART_BLEED = 24;
/** Highest device pixel ratio worth painting for; the art is soft anyway. */
const MAX_ART_DPR = 1.5;
/** The frost's outline flat and fully hinged; CSS moves between them with the panel. */
const FROST_REST = `path('${frostPath(0)}')`;
const FROST_OPEN = `path('${frostPath(HINGE_OPEN)}')`;
const FROST_BOX = {
  left: -FROST_PAD,
  top: FRONT_TOP - FROST_PAD,
  width: W + FROST_PAD * 2,
  height: FRONT_H + FROST_PAD,
} as const;

export interface GlassFolderProps {
  label: string;
  /** The second line, such as a count. Rolls in whenever it changes. */
  meta: string;
  /** `light` is milk glass, `dark` is smoked glass. */
  tone?: "light" | "dark";
  /** What the back panel holds, and which arrangement of it. */
  recipe: ArtRecipe;
  seed: number;
  /** The folder's contents, newest first. The newest few show; new ids drop in. */
  files: readonly FolderFile[];
  /** Where the folder itself leads: the glass and the art are one link. */
  href: string;
  /** Accessible name of that link. */
  linkLabel: string;
  /** Stands on the glass at its bottom right. Decorative: clicks pass through to the link. */
  keycap?: ReactNode;
  /** Controls pinned to the top-right corner, above the link, at full size. */
  corner?: ReactNode;
  /** Width in px. Everything scales with it; the height is (272 + 54) / 340 of it. */
  width: number;
  /** Assemble itself the first time it scrolls into view. */
  appear?: boolean;
  /** Delay before that entrance, in ms, for staggering a row of folders. */
  appearDelay?: number;
}

/**
 * A folder drawn as an object: a back panel holding generated artwork, the
 * files it contains, and a frosted-glass front panel hinged at the bottom.
 * The files are real elements between real panels, so the glass frosts them
 * as they move.
 *
 * - Rest: flat; the tops of the files only just show.
 * - Hover, or keyboard focus anywhere inside: the front falls forward and the
 *   files fan out, each one a link to its project.
 * - Click or tap the glass or the art: the folder's own link.
 * - A new file drops into the pocket, which gives a little under it.
 */
export function GlassFolder({
  label,
  meta,
  tone = "light",
  recipe,
  seed,
  files,
  href,
  linkLabel,
  keycap,
  corner,
  width,
  appear = true,
  appearDelay = 0,
}: GlassFolderProps) {
  const gradientId = `gf-rim-${useId().replace(/[^\w-]/g, "")}`;
  const root = useRef<HTMLDivElement>(null);
  const entered = useEntrance(root, appear, appearDelay);
  const { dropping, bump, settle } = useArrivals(files.map((file) => file.id));
  usePointerParallax(root);
  // Keyboard focus anywhere inside fans the files out; only then are they tab stops.
  // Touch screens never fan (see glass-folder.css), so there the folder link is the way in.
  const [focusInside, setFocusInside] = useState(false);
  const canFan = useMediaQuery("(hover: hover)");

  const k = width / W;
  const ratio = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const density = Math.min(MAX_ART_DPR, Math.max(1, ratio)) * k;
  // Newest first in, but the newest sit at the front of the stack, nearest the glass.
  const visible = files.slice(0, MAX_VISIBLE).reverse();
  const bumped = bump ? " gf-bump" : "";
  const style = {
    width,
    height: (H + HEADROOM) * k,
    "--gf-k": k,
    "--gf-hinge-open": `${HINGE_OPEN}deg`,
    "--gf-frost-rest": FROST_REST,
    "--gf-frost-open": FROST_OPEN,
  } as CSSProperties;

  return (
    <div
      ref={root}
      className="gf-root"
      data-testid="glass-folder"
      data-tone={tone}
      data-entered={entered || undefined}
      style={style}
      onFocus={() => setFocusInside(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocusInside(false);
      }}
    >
      <div className="gf-stage" style={{ transform: `translateY(${HEADROOM * k}px) scale(${k})` }}>
        <div className="gf-shadow" aria-hidden="true" />

        <div className="gf-back" style={{ clipPath: `path('${BACK_PATH}')` }} aria-hidden="true">
          <ArtCanvas
            className="gf-art"
            recipe={recipe}
            seed={seed}
            width={W + ART_BLEED}
            height={H + ART_BLEED}
            density={density}
          />
          <div className="gf-back-sheen" />
          {/* The art is part of the folder's link too; the glass's link is the one people reach. */}
          <Link href={href} className="gf-back-hit" tabIndex={-1} />
        </div>
        <svg className="gf-rim gf-back-rim" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
          <path d={BACK_PATH} />
        </svg>

        {/*
         * The frost is its own flat layer under the hinged panel: Chrome only blurs part
         * of the backdrop of a 3D-transformed element. Its outline follows the panel's.
         * Both are keyed on arrivals, so the pocket's bump replays for every new file.
         */}
        <div
          key={`frost-${bump}`}
          className={`gf-frost${bumped}`}
          style={FROST_BOX}
          aria-hidden="true"
        />
        <div
          key={`front-${bump}`}
          className={`gf-front${bumped}`}
          style={{ clipPath: `path('${FRONT_PATH}')` }}
        >
          <div className="gf-tint" aria-hidden="true" />
          <div className="gf-spec" aria-hidden="true" />
          <svg className="gf-rim gf-front-rim" viewBox={`0 0 ${W} ${FRONT_H}`} aria-hidden="true">
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#fff" stopOpacity="0.95" />
                <stop offset="0.35" stopColor="#fff" stopOpacity="0.35" />
                <stop offset="1" stopColor="#fff" stopOpacity="0.12" />
              </linearGradient>
            </defs>
            <path d={FRONT_PATH} stroke={`url(#${gradientId})`} />
          </svg>
          <Link href={href} className="gf-hit" aria-label={linkLabel} data-testid="folder-link" />
        </div>

        {/*
         * The label sits on its own flat layer over the glass instead of inside it: text
         * inside the hinged (3D-rotated) panel gets resampled and goes soft while it leans.
         * The panel barely moves near its bottom hinge, so the label still reads as printed
         * on it. Hidden from screen readers: the glass's link already says all of it.
         */}
        <div className="gf-label" aria-hidden="true">
          <span className="gf-title">{label}</span>
          <span className="gf-meta" key={meta}>
            {meta}
          </span>
        </div>

        {/* The contents: after the glass in tab order, beneath it on screen. */}
        <div className="gf-files" role="list" aria-label={`${label} contents`}>
          {visible.map((file, index) => (
            <FolderSheet
              key={file.id}
              file={file}
              slot={fanSlot(index, visible.length)}
              depth={visible.length - 1 - index}
              stackIndex={index}
              dropping={file.id === dropping}
              onDropEnd={settle}
              reachable={canFan && focusInside}
            />
          ))}
        </div>

        {keycap ? (
          <div className="gf-key" aria-hidden="true">
            {keycap}
          </div>
        ) : null}
      </div>

      {corner ? (
        <div className="gf-corner" style={{ top: HEADROOM * k }}>
          {corner}
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import type { Ref } from "react";
import { duration, ease, instant, spring } from "@/lib/motion";
import { folderHref } from "@/lib/routes";
import type { FolderNode } from "@/lib/store/folders";
import { Icon } from "../ui/Icon";
import { Menu, type MenuItem } from "../ui/Menu";

interface FolderTreeRowProps {
  node: FolderNode;
  count: number;
  open: boolean;
  active: boolean;
  /** An ancestor of the active folder. */
  onPath: boolean;
  /** The tree's one Tab stop. */
  tabbable: boolean;
  /** 1-based place among its siblings. */
  position: { index: number; size: number };
  actions: MenuItem[];
  itemRef: Ref<HTMLAnchorElement>;
  onToggle: () => void;
  onFocus: () => void;
}

/** Indent per level, in rem: deep trees stay inside the sidebar's width. */
const INDENT = 0.875;

/**
 * One folder in the sidebar tree: a disclosure arrow (pointer only; the
 * keyboard uses the arrow keys), the folder's link, which is the treeitem,
 * and its menu. The active row shares the sidebar's gliding indicator.
 */
export function FolderTreeRow({
  node,
  count,
  open,
  active,
  onPath,
  tabbable,
  position,
  actions,
  itemRef,
  onToggle,
  onFocus,
}: FolderTreeRowProps) {
  const reduce = useReducedMotion();
  const { folder, depth, hasChildren } = node;
  return (
    <motion.li
      role="none"
      layout={reduce ? false : "position"}
      initial={reduce ? false : { opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4, transition: { duration: reduce ? 0 : duration.micro } }}
      transition={{ duration: reduce ? 0 : duration.micro, ease: ease.out }}
      className="group relative flex min-h-11 items-center rounded-row"
      style={{ paddingLeft: `${depth * INDENT}rem` }}
    >
      {active ? (
        <motion.span
          layoutId="nav-indicator"
          transition={reduce ? instant : spring.snappy}
          className="absolute inset-0 rounded-row bg-seg"
        />
      ) : null}
      {hasChildren ? (
        <span
          aria-hidden="true"
          onClick={onToggle}
          data-testid="folder-toggle"
          className="relative grid size-11 shrink-0 cursor-pointer place-items-center rounded-pill text-muted hover:bg-hover hover:text-ink"
        >
          <Icon
            name="chevronRight"
            className={`size-4 transition-transform duration-150 ${open ? "rotate-90" : ""}`}
          />
        </span>
      ) : (
        <span aria-hidden="true" className="size-11 shrink-0" />
      )}
      <Link
        ref={itemRef}
        href={folderHref(folder.id)}
        scroll={false}
        role="treeitem"
        aria-level={depth + 1}
        aria-setsize={position.size}
        aria-posinset={position.index}
        aria-expanded={hasChildren ? open : undefined}
        aria-current={active ? "page" : undefined}
        tabIndex={tabbable ? 0 : -1}
        onFocus={onFocus}
        className={`relative flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-row pr-2 text-nav focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus ${
          active
            ? "font-semibold"
            : onPath
              ? "font-semibold text-ink"
              : "font-medium text-ink-2 hover:bg-hover active:bg-seg"
        }`}
      >
        <Icon name="folder" className={`size-5 shrink-0 ${onPath ? "text-brand-text" : ""}`} />
        <span className="min-w-0 flex-1 truncate whitespace-nowrap">{folder.name}</span>
        {/* With a pointer, the row menu shows over the count on hover, so names keep the room. */}
        <span className="text-label font-semibold text-muted tabular-nums [@media(hover:hover)]:group-focus-within:invisible [@media(hover:hover)]:group-hover:invisible">
          <span className="sr-only">, </span>
          {count}
          <span className="sr-only">
            {count === 1 ? " project" : " projects"}
            {hasChildren ? ", subfolders included" : ""}
          </span>
        </span>
      </Link>
      <Menu
        label={`Actions for ${folder.name}`}
        items={actions}
        triggerTabIndex={-1}
        testId="folder-tree-menu"
        className="relative shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 has-[[aria-expanded=true]]:opacity-100 [@media(hover:hover)]:absolute [@media(hover:hover)]:right-0 [@media(hover:none)]:opacity-100"
      />
    </motion.li>
  );
}

"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useId, useRef, type KeyboardEvent } from "react";
import { duration, ease, instant, spring } from "@/lib/motion";
import { folderHref } from "@/lib/routes";
import type { FolderNode } from "@/lib/store/folders";
import { Icon } from "../ui/Icon";
import { Menu, type MenuHandle, type MenuItem } from "../ui/Menu";

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
  itemRef: (element: HTMLLIElement | null) => void;
  onToggle: () => void;
  onFocus: () => void;
}

/** Indent per level, in rem (12px, on the 4px grid): deep trees stay inside the sidebar's width. */
const INDENT = 0.75;

/** Shift+F10, or the context-menu key: the platform keys for "this item's menu". */
function isMenuKey(event: KeyboardEvent): boolean {
  return (event.shiftKey && event.key === "F10") || event.key === "ContextMenu";
}

/**
 * One folder in the sidebar tree: the row is the treeitem, holding a
 * disclosure arrow (pointer only; the keyboard uses the arrow keys), the
 * folder's link (Enter on the row follows it) and its menu. The link and the
 * menu's trigger stay out of the Tab order, so the tree keeps one Tab stop;
 * from the keyboard, Shift+F10 or the context-menu key on the row opens the
 * menu, and focus comes back to the row. The active row shares the sidebar's
 * gliding indicator.
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
  const menu = useRef<MenuHandle>(null);
  const row = useRef<HTMLLIElement | null>(null);
  const link = useRef<HTMLAnchorElement>(null);
  const labelId = useId();
  /** The menu was opened from the keyboard, so the browser's own context menu stays shut. */
  const keyboardMenu = useRef(false);

  const onKeyDown = (event: KeyboardEvent<HTMLLIElement>) => {
    // Keys in the row's open menu are the menu's own.
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter") {
      event.preventDefault();
      link.current?.click();
    } else if (isMenuKey(event)) {
      event.preventDefault();
      keyboardMenu.current = true;
      menu.current?.open();
    }
  };

  return (
    // The row is the treeitem, so the tree owns treeitems only (axe aria-required-children);
    // its link and menu button inside are out of the Tab order, and Enter follows the link.
    <motion.li
      ref={(element: HTMLLIElement | null) => {
        row.current = element;
        itemRef(element);
      }}
      role="treeitem"
      aria-labelledby={labelId}
      aria-level={depth + 1}
      aria-setsize={position.size}
      aria-posinset={position.index}
      aria-expanded={hasChildren ? open : undefined}
      aria-current={active ? "page" : undefined}
      aria-keyshortcuts="Shift+F10"
      tabIndex={tabbable ? 0 : -1}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      onPointerDown={() => {
        keyboardMenu.current = false;
      }}
      onContextMenu={(event) => {
        // Windows sends the context-menu key's `contextmenu` after its keydown; a right-click
        // keeps the browser's menu (Open in new tab and so on).
        if (!keyboardMenu.current) return;
        keyboardMenu.current = false;
        event.preventDefault();
      }}
      layout={reduce ? false : "position"}
      initial={reduce ? false : { opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4, transition: { duration: reduce ? 0 : duration.micro } }}
      transition={{ duration: reduce ? 0 : duration.micro, ease: ease.out }}
      className="group relative flex min-h-11 items-center rounded-row focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
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
          className="relative grid size-11 shrink-0 cursor-pointer place-items-center rounded-pill text-muted transition-colors hover:bg-hover hover:text-ink active:bg-seg"
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
        ref={link}
        id={labelId}
        href={folderHref(folder.id)}
        scroll={false}
        tabIndex={-1}
        className={`relative flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-row pr-2 text-nav ${
          active
            ? "font-semibold"
            : onPath
              ? "font-semibold text-ink"
              : "font-medium text-ink-2 hover:bg-hover active:bg-seg"
        }`}
      >
        <Icon name="folder" className={`size-5 shrink-0 ${onPath ? "text-brand-text" : ""}`} />
        <span title={folder.name} className="min-w-0 flex-1 truncate whitespace-nowrap">
          {folder.name}
        </span>
        {/*
         * With a pointer, the row menu shows over the count on hover, so names keep the room.
         * A focused row shows the menu beside the count instead, so what's read is what shows.
         */}
        <span className="text-label font-semibold text-muted tabular-nums [@media(hover:hover)]:group-hover:group-not-focus-within:opacity-0">
          {/* Name, then count, as they show ("Alpha 3 projects"): WCAG 2.5.3, label in name. */}
          {count}
          <span className="sr-only">
            {count === 1 ? " project" : " projects"}
            {hasChildren ? " in all" : ""}
          </span>
        </span>
      </Link>
      <Menu
        label={`Actions for ${folder.name}`}
        items={actions}
        triggerTabIndex={-1}
        handle={menu}
        returnFocus={() => row.current}
        testId="folder-tree-menu"
        className="relative shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 has-[[aria-expanded=true]]:opacity-100 [@media(hover:hover)]:absolute [@media(hover:hover)]:right-0 [@media(hover:hover)]:group-focus-within:static [@media(hover:none)]:opacity-100"
      />
    </motion.li>
  );
}

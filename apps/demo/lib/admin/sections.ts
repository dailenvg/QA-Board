import type { NavSection } from "@/components/dashboard/SectionNav";
import { ADMIN_AUDIT_HREF, ADMIN_HREF } from "../routes";

/**
 * The admin panel's sections, in nav order. Workspaces, Storage and System
 * join them as they're built, never as links to nothing.
 */
export const ADMIN_SECTIONS: readonly NavSection[] = [
  { href: ADMIN_HREF, label: "Overview", icon: "layoutGrid", exact: true },
  { href: ADMIN_AUDIT_HREF, label: "Audit log", icon: "history" },
];

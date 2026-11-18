import type { NavSection } from "@/components/dashboard/SectionNav";
import {
  ADMIN_AUDIT_HREF,
  ADMIN_HREF,
  ADMIN_STORAGE_HREF,
  ADMIN_SYSTEM_HREF,
  ADMIN_WORKSPACES_HREF,
} from "../routes";

/** The admin panel's sections, in nav order. */
export const ADMIN_SECTIONS: readonly NavSection[] = [
  { href: ADMIN_HREF, label: "Overview", icon: "layoutGrid", exact: true },
  { href: ADMIN_WORKSPACES_HREF, label: "Workspaces", icon: "layers" },
  { href: ADMIN_STORAGE_HREF, label: "Storage", icon: "database" },
  { href: ADMIN_SYSTEM_HREF, label: "System", icon: "gear" },
  { href: ADMIN_AUDIT_HREF, label: "Audit log", icon: "history" },
];

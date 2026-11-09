import { usePathname } from "next/navigation";
import { useState } from "react";

/**
 * Whether the sidebar's folder tree is open: on each page, open in the Folders section
 * (`inFolders`) and closed elsewhere, until the person toggles it there. Their choice lasts
 * until the next page.
 */
export function useFoldersOpen(inFolders: boolean): { open: boolean; toggle: () => void } {
  const pathname = usePathname();
  const [choice, setChoice] = useState<{ pathname: string; open: boolean } | null>(null);
  const open = choice?.pathname === pathname ? choice.open : inFolders;
  return { open, toggle: () => setChoice({ pathname, open: !open }) };
}

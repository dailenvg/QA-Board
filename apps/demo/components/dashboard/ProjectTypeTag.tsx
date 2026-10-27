import type { ProjectSource } from "@/lib/store/types";
import { Icon } from "../ui/Icon";
import { projectKind } from "./project-source";

interface ProjectTypeTagProps {
  source: ProjectSource;
}

/**
 * Type pill over the thumbnail's top-left corner: icon and word ("Website", "Image", "PDF").
 * It renders inside the card's link, so a click on it opens the project; it is not a control of
 * its own. Highlight lime under dark ink (about 16:1, the same in both themes) stands out on any
 * thumbnail; a dark hairline and a soft shadow keep its edge on white pages, where lime alone
 * barely shows. The pill is hidden from screen readers, which hear the type once, as part of the
 * link's name ("Pitch deck, PDF").
 *
 * Placed against the card (its `relative` li, 12px padding), so top-5/left-5 is an 8px inset
 * inside the thumbnail. A website's browser-bar card (ProjectThumbnail) leaves this spot free.
 */
export function ProjectTypeTag({ source }: ProjectTypeTagProps) {
  const { label, icon } = projectKind(source);
  return (
    <>
      <span className="sr-only">, {label}</span>
      <span
        aria-hidden="true"
        data-testid="project-type-tag"
        className="absolute top-5 left-5 z-[1] inline-flex h-6 items-center gap-1 rounded-pill bg-highlight px-2 text-label font-semibold whitespace-nowrap text-on-highlight shadow-seg ring-1 ring-on-highlight/30"
      >
        <Icon name={icon} className="size-4 shrink-0" />
        {label}
      </span>
    </>
  );
}

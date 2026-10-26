import type { ProjectSource } from "@/lib/store/types";
import { Icon } from "../ui/Icon";
import { projectKind } from "./project-source";

interface ProjectTypeTagProps {
  source: ProjectSource;
}

/**
 * Round, icon-only type chip over the card's thumbnail corner. It renders inside the card's
 * link, so a click on it opens the project, and it sits above the link's full-card overlay so
 * its tooltip shows. Solid card color: legible on any thumbnail, in both themes. Screen readers
 * hear the type as part of the link's name.
 */
export function ProjectTypeTag({ source }: ProjectTypeTagProps) {
  const { label, icon } = projectKind(source);
  return (
    <>
      <span className="sr-only">, {label}</span>
      <span
        aria-hidden="true"
        title={label}
        data-testid="project-type-tag"
        className="absolute top-5 left-5 z-[1] grid size-8 place-items-center rounded-pill bg-card text-ink shadow-seg ring-1 ring-line"
      >
        <Icon name={icon} className="size-4" />
      </span>
    </>
  );
}

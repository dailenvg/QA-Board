import { OVERVIEW_HREF, folderHref } from "@/lib/routes";
import type { Folder } from "@/lib/store/types";
import { ButtonLink } from "../ui/ButtonLink";
import { Icon } from "../ui/Icon";

/** The owner's way back from the viewer: to the project's folder, else the Overview. */
export function FolderBackLink({ folder }: { folder: Folder | undefined }) {
  return (
    <ButtonLink
      href={folder ? folderHref(folder.id) : OVERVIEW_HREF}
      variant="ghost"
      size="sm"
      className="px-3"
      ariaLabel={`Back to ${folder?.name ?? "Overview"}`}
    >
      <Icon name="chevronLeft" className="size-5" />
      <span className="hidden max-w-40 truncate sm:inline">{folder?.name ?? "Overview"}</span>
    </ButtonLink>
  );
}

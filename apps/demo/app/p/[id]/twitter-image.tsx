import { renderProjectCard } from "@/components/link-preview/render-project-card";

export { alt, contentType, size } from "./opengraph-image";
export const dynamic = "force-dynamic";

/** The project link's card for X. Rendered here, not re-exported, so a cardVersion bump changes this URL too. */
export default function ProjectTwitterImage({ params }: { params: { id: string } }) {
  return renderProjectCard(params.id, { cardVersion: 5 });
}

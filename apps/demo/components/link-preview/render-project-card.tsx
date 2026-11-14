import { projectCard } from "@/lib/workspace/project-preview";
import { CARD_HEADERS, fallbackCard, overCardLimit } from "./card-response";
import { MainPreview } from "./MainPreview";
import { renderLinkPreview } from "./render-link-preview";
import { TeamReviewPreview } from "./TeamReviewPreview";

const mainCard = (cardVersion: number) => fallbackCard("main", () => <MainPreview />, cardVersion);

/**
 * The card for a project's own link (`/p/<id>`), read on the server: the
 * company's card, the project ready for its team's review. An id that
 * doesn't open to a live project, or a caller over its limit, gets Squint's
 * main card (the bytes /opengraph-image serves, already rendered), as the
 * page names it then: the image says no more than the page.
 */
export async function renderProjectCard(
  projectId: string,
  { cardVersion }: { cardVersion: number },
): Promise<Response> {
  if (await overCardLimit()) return mainCard(cardVersion);
  const card = await projectCard(projectId);
  if (!card) return mainCard(cardVersion);
  return renderLinkPreview(<TeamReviewPreview {...card} />, {
    cardVersion,
    headers: CARD_HEADERS,
  });
}

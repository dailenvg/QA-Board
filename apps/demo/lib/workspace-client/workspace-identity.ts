import { createContext, use } from "react";
import type { WorkspaceIdentity } from "../workspace/types";

/**
 * The signed-in workspace as its guests meet it (its name, sender and color),
 * as the server rendered the page. Null outside `WorkspaceProvider`.
 */
export const WorkspaceIdentityContext = createContext<WorkspaceIdentity | null>(null);

export function useWorkspaceIdentity(): WorkspaceIdentity | null {
  return use(WorkspaceIdentityContext);
}

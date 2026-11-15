import { createContext, use } from "react";
import type { SignedInWorkspace } from "../workspace/types";

/**
 * The signed-in workspace as the server rendered the page: as its guests
 * meet it (its name, sender and color), and what the member may do there
 * (`useWorkspaceAccess` keeps that fresh). Null outside `WorkspaceProvider`.
 */
export const WorkspaceIdentityContext = createContext<SignedInWorkspace | null>(null);

export function useWorkspaceIdentity(): SignedInWorkspace | null {
  return use(WorkspaceIdentityContext);
}

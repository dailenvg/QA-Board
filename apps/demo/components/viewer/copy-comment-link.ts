import { absoluteHref } from "@/lib/comment-link";
import type { ToastInput } from "../ui/ToastProvider";

/**
 * Copies a comment's link (`href`, a path on this site) as an absolute URL,
 * and says how it went. The write starts inside the tap, before anything is
 * awaited: Safari refuses the clipboard once the tap's activation is spent.
 */
export function copyCommentLink(href: string, toast: (toast: ToastInput) => void): void {
  let writing: Promise<void>;
  try {
    writing = navigator.clipboard.writeText(absoluteHref(href));
  } catch {
    // No clipboard at all (an insecure context): the same as a refusal.
    writing = Promise.reject(new Error("no clipboard"));
  }
  void writing.then(
    () => toast({ message: "Link copied" }),
    () => toast({ tone: "error", message: "Couldn't copy the link." }),
  );
}

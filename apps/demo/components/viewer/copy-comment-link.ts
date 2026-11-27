import { absoluteHref } from "@/lib/comment-link";
import type { ToastInput } from "../ui/ToastProvider";

/**
 * Copies a comment's link (`href`, a path on this site) as an absolute URL,
 * and says how it went in a toast; resolves true once the clipboard has it.
 * The write starts inside the tap, before anything is awaited: Safari refuses
 * the clipboard once the tap's activation is spent.
 */
export function copyCommentLink(
  href: string,
  toast: (toast: ToastInput) => void,
): Promise<boolean> {
  let writing: Promise<void>;
  try {
    writing = navigator.clipboard.writeText(absoluteHref(href));
  } catch {
    // No clipboard at all (an insecure context): the same as a refusal.
    writing = Promise.reject(new Error("no clipboard"));
  }
  return writing.then(
    () => {
      toast({ message: "Link copied." });
      return true;
    },
    () => {
      toast({ tone: "error", message: "Couldn't copy the link." });
      return false;
    },
  );
}

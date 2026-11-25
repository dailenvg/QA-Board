/**
 * Whether a reply arriving at the end of a thread scrolls into view: one's
 * own (just sent, most often), or anyone's while focus is in this thread's
 * reply box (`composer`), so the reply someone is answering stays in sight.
 * Someone else's reply that a sync brings never moves a thread being read,
 * wherever else focus is (the popover itself, a reply's menu), nor one with
 * no box (a guest under a resolved comment, or after the window).
 */
export function revealsNewReply(
  mine: boolean,
  composer: Pick<Node, "contains"> | null,
  active: Node | null,
): boolean {
  return mine || (composer !== null && active !== null && composer.contains(active));
}

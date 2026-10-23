/** Instructions shown above the toolbar while comment mode is on. */
export function CommentHint() {
  return (
    <div className="pp-bubble" aria-hidden="true">
      <p>
        <strong>Click or tap</strong> any element to pin a comment.
      </p>
      <p>
        Keyboard: <span className="pp-kbd">Tab</span> or arrow keys to choose,{" "}
        <span className="pp-kbd">Enter</span> to pin, <span className="pp-kbd">Esc</span> to cancel.
      </p>
    </div>
  );
}

import type { ReactNode } from "react";
import { formatAbsoluteTime, formatRelativeTime } from "../core/time";

interface MessageProps {
  author: string;
  createdAt: string;
  body: string;
  /** Extra metadata such as priority or status tags. */
  tags?: ReactNode;
}

/** One comment or reply: author, timestamp, optional tags, body. */
export function Message({ author, createdAt, body, tags }: MessageProps) {
  return (
    <article className="pp-message">
      <div className="pp-meta">
        <span className="pp-author">{author}</span>
        <time dateTime={createdAt} title={formatAbsoluteTime(createdAt)}>
          {formatRelativeTime(createdAt)}
        </time>
        {tags}
      </div>
      <p className="pp-message__body">{body}</p>
    </article>
  );
}

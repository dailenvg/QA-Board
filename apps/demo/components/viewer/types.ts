export type ViewerMode = "browse" | "comment";
export type CommentTab = "active" | "resolved";

export interface PinPoint {
  x: number;
  y: number;
}

export interface Draft extends PinPoint {
  body: string;
}

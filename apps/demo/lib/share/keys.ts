/** A shared page's picture, in the share's blob keys (`page:<pageId>`). Shared by server and browser. */
export const pageBlobKey = (pageId: string) => `page:${pageId}`;

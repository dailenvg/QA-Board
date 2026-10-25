/** Blob keys are derived from record ids, so any copy of the data can find its images. */
export const snapshotBlobKey = (snapshotId: string) => `snapshot:${snapshotId}`;

export const cropBlobKey = (commentId: string) => `crop:${commentId}`;

/**
 * The picture of an image project from before pages (versions 1 and 2). Its
 * migrated page keeps pointing at it, so nothing is copied.
 */
export const projectImageKey = (projectId: string) => `image:${projectId}`;

/** A page's picture, for pages added since version 3. Page ids from `newId` are unique. */
export const pageImageKey = (pageId: string) => `page:${pageId}`;

/** Blob keys are derived from record ids, so any copy of the data can find its images. */
export const snapshotBlobKey = (snapshotId: string) => `snapshot:${snapshotId}`;

export const cropBlobKey = (commentId: string) => `crop:${commentId}`;

/** An image project's picture. Replacing the image overwrites it in place. */
export const projectImageKey = (projectId: string) => `image:${projectId}`;

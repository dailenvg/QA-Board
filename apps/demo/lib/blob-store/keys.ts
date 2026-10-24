/** Blob keys are derived from record ids, so any copy of the data can find its images. */
export const snapshotBlobKey = (snapshotId: string) => `snapshot:${snapshotId}`;

export const cropBlobKey = (commentId: string) => `crop:${commentId}`;

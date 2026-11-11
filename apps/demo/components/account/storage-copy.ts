import type { StorageBucket } from "@/lib/account/storage-buckets";

/** Every line the Storage page shows, in one place for review. */

/** "1 file", "3 files". */
export function fileCount(n: number): string {
  return `${new Intl.NumberFormat("en").format(n)} ${n === 1 ? "file" : "files"}`;
}

export const STORAGE_COPY = {
  loading: "Loading your storage…",
  usage: {
    title: "Usage",
    description:
      "Everything your workspace stores counts toward its space: page images, PDFs, website snapshots and comment crops.",
    /** "1.2 GB of 5 GB used". */
    used: (quota: string) => `of ${quota} used`,
    near: {
      title: "Running low on space",
      body: "Your workspace has used most of its space. Projects in the trash keep using space for 30 days, so clear out what you don't need soon. For more space, ask your Squint admin.",
    },
    over: {
      title: "Out of space",
      body: "New uploads and snapshots won't save until there's room again. Projects in the trash keep using space for 30 days. For more space now, ask your Squint admin.",
    },
  },
  breakdown: {
    title: "What's using space",
    description: "Your workspace's files, by kind.",
    empty:
      "Nothing stored yet. Page images, PDFs, snapshots and crops show up here once you add them.",
  },
  buckets: {
    images: { label: "Images", hint: "Pages uploaded as images" },
    pdfs: { label: "PDFs", hint: "Pages of uploaded PDFs" },
    snapshots: { label: "Snapshots", hint: "Captures of website projects" },
    crops: { label: "Crops", hint: "Close-ups saved with comments" },
    videos: { label: "Videos", hint: "Video projects" },
    other: { label: "Other", hint: "Your workspace's logo" },
  } satisfies Record<StorageBucket, { label: string; hint: string }>,
  large: {
    title: "Large projects",
    description:
      "Your projects that use the most space, biggest first. Archived projects and projects in the trash still count until they're deleted for good.",
    archived: "Archived",
    trashed: "In trash",
    /** "Deletes for good on Dec 10, 2026". */
    deletesOn: (date: string) => `Deletes for good on ${date}`,
    emptyTitle: "No projects are using space yet",
    emptyBody: "Projects show up here once they hold page images, PDFs, snapshots or crops.",
  },
} as const;

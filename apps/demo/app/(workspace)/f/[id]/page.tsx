import type { Metadata } from "next";
import { FolderView } from "@/components/dashboard/FolderView";

export const metadata: Metadata = { title: "Folder" };

export default async function FolderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FolderView folderId={id} />;
}

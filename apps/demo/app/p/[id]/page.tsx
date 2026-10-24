import type { Metadata } from "next";
import { Viewer } from "@/components/viewer/Viewer";

export const metadata: Metadata = { title: "Review" };

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Viewer projectId={id} />;
}

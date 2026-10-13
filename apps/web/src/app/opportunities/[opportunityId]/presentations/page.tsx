import { PresentationWorkspace } from "@/components/PresentationWorkspace";

interface PresentationsPageProps {
  params: Promise<{ opportunityId: string }>;
}

export default async function PresentationsPage({ params }: PresentationsPageProps) {
  const { opportunityId } = await params;
  return <PresentationWorkspace opportunityId={opportunityId} />;
}

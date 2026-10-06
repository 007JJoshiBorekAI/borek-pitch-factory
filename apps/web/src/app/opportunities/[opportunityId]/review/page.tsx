import { OwnerCheckpointPanel } from "@/components/OwnerCheckpointPanel";

interface ReviewPageProps {
  params: Promise<{ opportunityId: string }>;
}

export default async function ReviewPage({ params }: ReviewPageProps) {
  const { opportunityId } = await params;
  return <OwnerCheckpointPanel opportunityId={opportunityId} />;
}

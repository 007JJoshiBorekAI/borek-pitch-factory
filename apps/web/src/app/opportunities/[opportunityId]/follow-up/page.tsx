import { FollowUpDraftPanel } from "@/components/FollowUpDraftPanel";

interface FollowUpPageProps {
  params: Promise<{ opportunityId: string }>;
}

export default async function FollowUpPage({ params }: FollowUpPageProps) {
  const { opportunityId } = await params;
  return <FollowUpDraftPanel opportunityId={opportunityId} />;
}

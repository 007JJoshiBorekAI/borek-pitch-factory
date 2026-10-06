import { MeetingEvidencePanel } from "@/components/MeetingEvidencePanel";

interface MeetingPageProps {
  params: Promise<{ opportunityId: string }>;
}

export default async function MeetingPage({ params }: MeetingPageProps) {
  const { opportunityId } = await params;
  return <MeetingEvidencePanel opportunityId={opportunityId} />;
}

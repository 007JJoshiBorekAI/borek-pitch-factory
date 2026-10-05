import { redirect } from "next/navigation";

interface OpportunityPageProps {
  params: Promise<{ opportunityId: string }>;
}

export default async function OpportunityPage({ params }: OpportunityPageProps) {
  const { opportunityId } = await params;
  redirect(`/opportunities/${encodeURIComponent(opportunityId)}/client-information`);
}

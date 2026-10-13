import { DiscoveryAnalysisWorkspace } from "@/components/DiscoveryAnalysisWorkspace";
import { DiscoveryWorkspace } from "@/components/DiscoveryWorkspace";
import { createDiscoveryWorkspaceFixture } from "@/lib/discoveryWorkspace";

interface DiscoveryPageProps {
  params: Promise<{ opportunityId: string }>;
}

export default async function DiscoveryPage({ params }: DiscoveryPageProps) {
  const { opportunityId } = await params;
  // Discovery is the AI Opportunity Analysis. The seven-page viewer only opens papers that were
  // stored in the old format, so that they stay readable.
  return (
    <DiscoveryAnalysisWorkspace
      opportunityId={opportunityId}
      legacy={<DiscoveryWorkspace initialVersion={createDiscoveryWorkspaceFixture(opportunityId)} />}
    />
  );
}

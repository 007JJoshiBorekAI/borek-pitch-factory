import { DiscoveryWorkspace } from "@/components/DiscoveryWorkspace";
import { createDiscoveryWorkspaceFixture } from "@/lib/discoveryWorkspace";

interface DiscoveryPageProps {
  params: Promise<{ opportunityId: string }>;
}

export default async function DiscoveryPage({ params }: DiscoveryPageProps) {
  const { opportunityId } = await params;
  return <DiscoveryWorkspace initialVersion={createDiscoveryWorkspaceFixture(opportunityId)} />;
}

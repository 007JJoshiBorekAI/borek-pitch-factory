import workspaceFixture from "./fixtures/discovery_first/workspace.json";
import {
  parseDiscoveryFirstWorkspaceFixture,
  type DiscoveryFirstWorkspaceFixture,
} from "./discoveryFirst";

const VALIDATED_WORKSPACE_FIXTURE = parseDiscoveryFirstWorkspaceFixture(workspaceFixture);

export function discoveryFirstFixtureForOpportunity(
  opportunityId: string,
): DiscoveryFirstWorkspaceFixture {
  const scopedId = opportunityId.trim();
  if (!scopedId) {
    throw new Error("An explicit opportunity ID is required.");
  }
  return parseDiscoveryFirstWorkspaceFixture({
    ...VALIDATED_WORKSPACE_FIXTURE,
    opportunity_id: scopedId,
  });
}

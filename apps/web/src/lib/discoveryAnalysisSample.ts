// The analysis shown in preview mode, where no server session exists. It is the server's own
// deterministic fixture output for a client without any information, written by
// scripts/generate_discovery_analysis_sample.py - never edited by hand.
import sample from "./discoveryAnalysisSample.json";

export function sampleAnalysis(opportunityId: string): unknown {
  return { ...structuredClone(sample), opportunity_id: opportunityId };
}

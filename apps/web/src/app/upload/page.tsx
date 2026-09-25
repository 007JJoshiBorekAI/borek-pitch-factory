import { RequireAuth } from "@/components/RequireAuth";
import { TranscriptUploadPanel } from "@/components/TranscriptUploadPanel";
import { parseJourneyStageQuery } from "@/lib/journeyStageSelection";

interface UploadPageProps {
  searchParams: Promise<{ opportunityId?: string; new?: string; journeyStage?: string }>;
}

export default async function UploadPage({ searchParams }: UploadPageProps) {
  const params = await searchParams;
  const opportunityId = params.opportunityId?.trim() || null;
  const startFresh = params.new === "1";
  const initialJourneyStage = parseJourneyStageQuery(params.journeyStage);

  return (
    <RequireAuth>
      <TranscriptUploadPanel
        key={`${opportunityId ?? "new"}:${startFresh}:${initialJourneyStage ?? "default"}`}
        initialOpportunityId={opportunityId}
        initialJourneyStage={initialJourneyStage}
        startFresh={startFresh}
      />
    </RequireAuth>
  );
}

import { MeetingPreparationPanel } from "@/components/MeetingPreparationPanel";
import { PipelineContextMissing } from "@/components/PipelineContextMissing";
import { RequireAuth } from "@/components/RequireAuth";

interface MeetingPreparationPageProps {
  searchParams: Promise<{ opportunityId?: string }>;
}

export default async function MeetingPreparationPage({ searchParams }: MeetingPreparationPageProps) {
  const params = await searchParams;
  const opportunityId = params.opportunityId?.trim() ?? "";

  return (
    <RequireAuth>
      {!opportunityId ? (
        <PipelineContextMissing
          title="Meeting preparation"
          detail="Open meeting preparation from create pitch after Stage 2 is complete."
        />
      ) : (
        <MeetingPreparationPanel />
      )}
    </RequireAuth>
  );
}

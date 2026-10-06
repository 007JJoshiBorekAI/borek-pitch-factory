import { PostMeetingPresentationWorkspace } from "@/components/PostMeetingPresentationWorkspace";

export default async function PostMeetingPresentationPage({ params }: {
  params: Promise<{ opportunityId: string }>;
}) {
  const { opportunityId } = await params;
  return <PostMeetingPresentationWorkspace opportunityId={opportunityId} />;
}

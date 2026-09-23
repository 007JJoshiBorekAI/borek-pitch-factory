import { redirect } from "next/navigation";

interface UploadPageProps {
  searchParams: Promise<{ opportunityId?: string }>;
}

export default async function UploadPage({ searchParams }: UploadPageProps) {
  const params = await searchParams;
  const opportunityId = params.opportunityId?.trim();
  if (opportunityId) {
    redirect(`/first-contact?opportunityId=${encodeURIComponent(opportunityId)}`);
  }
  redirect("/");
}

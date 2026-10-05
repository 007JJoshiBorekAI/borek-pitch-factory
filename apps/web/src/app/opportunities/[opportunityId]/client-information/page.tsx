import { ClientInformationEditor } from "@/components/ClientInformationEditor";
import { discoveryFirstFixtureForOpportunity } from "@/lib/discoveryFirstFixtures";

interface ClientInformationPageProps {
  params: Promise<{ opportunityId: string }>;
}

export default async function ClientInformationPage({ params }: ClientInformationPageProps) {
  const { opportunityId } = await params;
  const fixture = discoveryFirstFixtureForOpportunity(opportunityId);
  const values = opportunityId === "new"
    ? {
        company_name: "",
        contact_person: "",
        website_url: "",
        meeting_purpose: "",
        additional_information: "",
      }
    : fixture.client_information;

  return <ClientInformationEditor initialRecord={{
    opportunity_id: opportunityId,
    revision: 1,
    values,
    source: "fixture",
  }} />;
}

import type { Stage1Intake } from "@/lib/api";
import type { PitchDraft } from "@/lib/pitchDraft";

export function buildStage1Intake(draft: PitchDraft): Stage1Intake {
  const aboutParts = [draft.description.trim(), draft.voiceNote.trim()].filter(Boolean);
  const salesTopic = draft.businessNeed.trim() || draft.pitchTitle.trim() || null;
  return {
    client_web_page: null,
    poc_name: null,
    poc_position: null,
    sales_topic_description: salesTopic,
    about_company: aboutParts.length > 0 ? aboutParts.join("\n\n") : null,
  };
}

export function buildIntakeNotesFile(draft: PitchDraft): File {
  const lines = [
    `Client: ${draft.client.trim()}`,
    `Opportunity: ${draft.pitchTitle.trim()}`,
    draft.service.trim() ? `Service / solution: ${draft.service.trim()}` : "",
    draft.businessNeed.trim() ? `Business need: ${draft.businessNeed.trim()}` : "",
    draft.description.trim() ? `Description:\n${draft.description.trim()}` : "",
    draft.voiceNote.trim() ? `Additional notes:\n${draft.voiceNote.trim()}` : "",
    draft.owner.trim() ? `Pitch owner: ${draft.owner.trim()}` : "",
    draft.team.trim() ? `Team: ${draft.team.trim()}` : "",
  ].filter(Boolean);
  const body = lines.join("\n\n");
  return new File([body], "intake-notes.txt", { type: "text/plain" });
}

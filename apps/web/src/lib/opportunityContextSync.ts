import {
  getOpportunity,
  updateOpportunity,
  type AdditionalClientInformation,
  type OpportunityResponse,
  type OpportunityUpdatePayload,
  type Stage1Intake,
} from "@/lib/api";
import {
  draftFromNotes,
  emptyPitchDraft,
  informationWithDraft,
  loadPitchDraft,
  savePitchDraft,
  type PitchDraft,
} from "@/lib/pitchDraft";
import { buildStage1Intake } from "@/lib/stage1Prepare";

function pickText(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return null;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function linesFromBlock(text: string | null | undefined): string[] {
  const raw = text?.trim();
  if (!raw) {
    return [];
  }
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function mergeAboutCompany(existing: string | null | undefined, enriched: string | null): string | null {
  const parts = uniqueStrings([existing, enriched]);
  if (parts.length === 0) {
    return null;
  }
  if (parts.length === 1) {
    return parts[0];
  }
  const existingText = existing?.trim() ?? "";
  const enrichedText = enriched?.trim() ?? "";
  if (existingText && enrichedText && !existingText.includes(enrichedText)) {
    return `${existingText}\n\n${enrichedText}`;
  }
  return parts.join("\n\n");
}

/** Fold meeting / opportunity draft fields into intake text for later Deepening stages. */
export function enrichStage1IntakeFromDraft(
  draft: PitchDraft,
  opportunity: Pick<OpportunityResponse, "client_name" | "opportunity_name">,
): Stage1Intake {
  const base = buildStage1Intake({
    ...draft,
    client: draft.client.trim() || opportunity.client_name,
    pitchTitle: draft.pitchTitle.trim() || opportunity.opportunity_name,
  });
  const aboutSections = uniqueStrings([
    base.about_company,
    draft.summary.trim() ? `Meeting summary:\n${draft.summary.trim()}` : null,
    draft.painPoints.trim() ? `Pain points:\n${draft.painPoints.trim()}` : null,
    draft.requirements.trim() ? `Requirements:\n${draft.requirements.trim()}` : null,
    draft.meetingDate.trim() || draft.participants.trim()
      ? `Meeting: ${[draft.meetingDate.trim(), draft.participants.trim()].filter(Boolean).join(" — ")}`
      : null,
    draft.scope.trim() ? `Scope:\n${draft.scope.trim()}` : null,
    draft.timeline.trim() ? `Timeline: ${draft.timeline.trim()}` : null,
  ]);
  const salesTopic = pickText(
    base.sales_topic_description,
    draft.businessOpportunity,
    draft.proposedSolution,
    draft.borekServices,
  );
  return {
    client_web_page: base.client_web_page,
    poc_name: pickText(draft.primaryContact, draft.decisionMakers),
    poc_position: pickText(draft.stakeholders),
    sales_topic_description: salesTopic,
    about_company: aboutSections.length > 0 ? aboutSections.join("\n\n") : base.about_company,
  };
}

export function mergeStage1Intake(
  existing: Stage1Intake | null | undefined,
  draft: PitchDraft,
  opportunity: Pick<OpportunityResponse, "client_name" | "opportunity_name">,
): Stage1Intake {
  const enriched = enrichStage1IntakeFromDraft(draft, opportunity);
  return {
    client_web_page: pickText(existing?.client_web_page, enriched.client_web_page),
    poc_name: pickText(existing?.poc_name, enriched.poc_name),
    poc_position: pickText(existing?.poc_position, enriched.poc_position),
    sales_topic_description: pickText(
      existing?.sales_topic_description,
      enriched.sales_topic_description,
    ),
    about_company: mergeAboutCompany(existing?.about_company, enriched.about_company ?? null),
  };
}

export function mergeClientInformation(
  current: AdditionalClientInformation | null | undefined,
  draft: PitchDraft,
): AdditionalClientInformation {
  const withNotes = informationWithDraft(current, draft);
  const constraints = uniqueStrings([
    ...(current?.constraints ?? []),
    ...linesFromBlock(draft.painPoints),
    draft.scope.trim() ? `Scope: ${draft.scope.trim()}` : null,
    draft.budget.trim() ? `Budget: ${draft.budget.trim()}` : null,
    draft.timeline.trim() ? `Timeline: ${draft.timeline.trim()}` : null,
  ]);
  const priorities = uniqueStrings([
    ...(current?.priorities ?? []),
    draft.businessNeed,
    draft.businessOpportunity,
    draft.proposedSolution,
    draft.borekServices,
    draft.nextSteps,
  ]);
  const contacts = [...(current?.contacts ?? [])];
  const primary = draft.primaryContact.trim();
  if (primary && !contacts.some((contact) => contact.name?.trim() === primary)) {
    contacts.push({
      name: primary,
      role: draft.decisionMakers.trim() || draft.stakeholders.trim() || null,
      email: null,
      phone: null,
    });
  }
  return {
    ...withNotes,
    constraints: constraints.length > 0 ? constraints : withNotes.constraints,
    priorities: priorities.length > 0 ? priorities : withNotes.priorities,
    contacts,
  };
}

export function resolvePitchDraft(
  opportunityId: string,
  opportunity: OpportunityResponse,
): PitchDraft {
  return (
    loadPitchDraft(opportunityId) ??
    draftFromNotes(opportunity.additional_client_information?.notes) ??
    emptyPitchDraft({
      client: opportunity.client_name,
      pitchTitle: opportunity.opportunity_name,
    })
  );
}

export function buildPersistedContextPayload(
  opportunity: OpportunityResponse,
  draft: PitchDraft,
): Pick<OpportunityUpdatePayload, "stage1_intake" | "additional_client_information"> {
  return {
    stage1_intake: mergeStage1Intake(opportunity.stage1_intake, draft, opportunity),
    additional_client_information: mergeClientInformation(
      opportunity.additional_client_information,
      draft,
    ),
  };
}

/** Persist intake + client pack so Deepening / customer story jobs read full prior context. */
export async function persistOpportunityContext(
  accessToken: string,
  opportunityId: string,
  options?: { draft?: PitchDraft; opportunity?: OpportunityResponse },
): Promise<OpportunityResponse> {
  const opportunity =
    options?.opportunity ?? (await getOpportunity(accessToken, opportunityId));
  const draft = options?.draft ?? resolvePitchDraft(opportunityId, opportunity);
  const updated = await updateOpportunity(
    accessToken,
    opportunityId,
    buildPersistedContextPayload(opportunity, draft),
  );
  savePitchDraft(opportunityId, draft);
  return updated;
}

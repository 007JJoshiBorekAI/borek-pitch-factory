import {
  stage1OutputsDemo,
  stage1ResearchDemo,
  stage2OutputsDemo,
} from "./stageOutputDemoFixtures";
import { FIRST_CONTACT_SLIDE_COUNT } from "./stageOutputArtifacts";
import { factDisplayValue, hypothesisDisplayValue } from "./stage1ResearchView";

export function demoResearchFacts() {
  return [
    {
      label: "Description",
      value: factDisplayValue(stage1ResearchDemo.company_facts.description),
    },
    {
      label: "Headquarters",
      value: factDisplayValue(stage1ResearchDemo.company_facts.headquarters),
    },
    {
      label: "Headcount",
      value: factDisplayValue(stage1ResearchDemo.company_facts.employee_headcount),
    },
    {
      label: "Decision makers",
      value: factDisplayValue(stage1ResearchDemo.company_facts.decision_makers),
    },
    {
      label: "Revenue",
      value: factDisplayValue(stage1ResearchDemo.company_facts.revenue),
    },
  ];
}

export function demoHypothesisText(): string {
  const hypothesis = hypothesisDisplayValue(stage1ResearchDemo.hypothesis);
  if (hypothesis) {
    return hypothesis;
  }
  return stage1ResearchDemo.borek_offering.value ?? "Unknown — offering not resolved.";
}

export function demoDiscoveryQuestions(): string[] {
  return stage1OutputsDemo.discovery_questions.items
    .filter((item) => item.text)
    .map((item) => item.text as string);
}

export function demoUseCases(): Array<{ title: string; summary: string }> {
  return stage1OutputsDemo.use_cases.items
    .filter((item) => item.title && item.relevance_summary)
    .map((item) => ({
      title: item.title as string,
      summary: item.relevance_summary as string,
    }));
}

export function demoMeetingAgenda(): Array<{ topic: string; duration: number | null; notes: string | null }> {
  return stage1OutputsDemo.meeting_agenda.items.map((item) => ({
    topic: item.topic,
    duration: item.duration_minutes,
    notes: item.notes,
  }));
}

export function demoFirstMeetingDeckProfile(): string {
  return stage1OutputsDemo.presentation_ref.profile;
}

export function demoFirstMeetingSlideCount(): number {
  return FIRST_CONTACT_SLIDE_COUNT;
}

export function demoDeepeningSummary(): string {
  return stage2OutputsDemo.call_summary.text;
}

export function demoDeepeningMomSections(): Array<{ heading: string; body: string }> {
  return stage2OutputsDemo.minutes_of_meeting.sections.map((section) => ({
    heading: section.heading,
    body: section.body,
  }));
}

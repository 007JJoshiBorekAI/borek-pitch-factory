import {
  stage1OutputsDemo,
  stage1ResearchDemo,
  stage2OutputsDemo,
} from "./stageOutputDemoFixtures";
import { FIRST_CONTACT_SLIDE_COUNT } from "./stageOutputArtifacts";

interface FactLike {
  status?: string;
  value?: string | null;
  text?: string | null;
}

function displayFact(fact: FactLike | undefined): string {
  if (!fact) {
    return "Not available";
  }
  if (fact.value) {
    return fact.value;
  }
  if (fact.text) {
    return fact.text;
  }
  return fact.status === "unknown" ? "Unknown — pending research" : "Not available";
}

export function demoResearchFacts() {
  return [
    { label: "Description", value: displayFact(stage1ResearchDemo.company_facts.description) },
    { label: "Headquarters", value: displayFact(stage1ResearchDemo.company_facts.headquarters) },
    { label: "Headcount", value: displayFact(stage1ResearchDemo.company_facts.employee_headcount) },
    { label: "Decision makers", value: displayFact(stage1ResearchDemo.company_facts.decision_makers) },
    { label: "Revenue", value: displayFact(stage1ResearchDemo.company_facts.revenue) },
  ];
}

export function demoHypothesisText(): string {
  const hypothesis = displayFact(stage1ResearchDemo.hypothesis);
  if (hypothesis !== "Unknown — pending research" && hypothesis !== "Not available") {
    return hypothesis;
  }
  return displayFact(stage1ResearchDemo.borek_offering);
}

export function demoDiscoveryQuestions(): string[] {
  return stage1OutputsDemo.discovery_questions.items.map((item) => item.text);
}

export function demoUseCases(): Array<{ title: string; summary: string }> {
  return stage1OutputsDemo.use_cases.items.map((item) => ({
    title: item.title,
    summary: item.relevance_summary,
  }));
}

export function demoMeetingAgenda(): Array<{ topic: string; duration: number; notes: string | null }> {
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

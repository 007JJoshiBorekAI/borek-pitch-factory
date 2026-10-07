import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { canPreparePostMeetingEmail, loadPostMeetingEmail, parsePostMeetingEmail } from "./postMeetingEmail";
import type { PostMeetingWorkflow } from "./postMeeting";

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const envelope = { opportunity_id: id, journey_stage: "deepening", draft: { id: "draft-1", updated_at: "2026-10-06", selected_length: null, lengths: { medium: { subject: "Follow-up", body: "Original body" }, short: { subject: "Short", body: "Short body" } } } };

test("email parser preserves generated content and respects selected length", () => {
  assert.equal(parsePostMeetingEmail(envelope, id)?.body, "Original body");
  assert.equal(parsePostMeetingEmail({ ...envelope, draft: { ...envelope.draft, selected_length: "short" } }, id)?.subject, "Short");
  assert.equal(parsePostMeetingEmail({ ...envelope, draft: null }, id), null);
  assert.throws(() => parsePostMeetingEmail({ ...envelope, opportunity_id: "another" }, id), /does not belong/);
  assert.throws(() => parsePostMeetingEmail({ ...envelope, journey_stage: "first_contact" }, id), /does not belong/);
  assert.throws(() => parsePostMeetingEmail({ ...envelope, draft: {} }, id), /incomplete/);
});

test("preparation requires authoritative review and finalization, not merely a status label", () => {
  const workflow: PostMeetingWorkflow = { opportunity_id: id, current_status: "finalized", steps: [], documents: { ppt1: null, ppt2: null, approved_discovery: null }, finalization: null };
  assert.equal(canPreparePostMeetingEmail(workflow), false);
  workflow.steps = [{ key: "owner_review", state: "completed" }, { key: "finalized", state: "completed" }];
  assert.equal(canPreparePostMeetingEmail(workflow), false);
  workflow.finalization = { id: "snapshot-1" };
  assert.equal(canPreparePostMeetingEmail(workflow), true);
});

test("email reload reads opportunity-scoped draft and never invokes delivery", async () => {
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (input, init) => {
    calls.push(String(input));
    assert.equal(init?.method ?? "GET", "GET");
    assert.match(String(input), new RegExp(`/opportunities/${id}/email-drafts\\?journey_stage=deepening$`));
    return Response.json(envelope);
  };
  try {
    assert.equal((await loadPostMeetingEmail("token", id))?.id, "draft-1");
    assert.equal(calls.length, 1);
    assert.equal(calls.some((url) => /\/send|smtp/.test(url)), false);
  } finally { globalThis.fetch = original; }
});

test("follow-up surface exposes editing while unsupported export remains disabled", () => {
  const source = readFileSync(new URL("../components/FollowUpDraftPanel.tsx", import.meta.url), "utf8");
  assert.match(source, /setSubject\(event.target.value\)/);
  assert.match(source, /setBody\(event.target.value\)/);
  assert.match(source, /disabled aria-describedby="email-export-blocked"/);
  assert.match(source, /Unsaved local edits/);
  assert.match(source, /!loaded.current \|\| busy \|\| dirty/);
  assert.match(source, /!live \|\| loaded.current/);
  assert.doesNotMatch(source, /\/send|smtp|mailto:/i);
});

test("reference-2 sidebar is one card with four ordered sections and no embedded checkpoint form", () => {
  const source = readFileSync(new URL("../components/FollowUpDraftPanel.tsx", import.meta.url), "utf8");
  const sidebar = source.slice(source.indexOf("<aside"), source.indexOf("</aside>") + "</aside>".length);
  const headings = ["Updated client documents", "What changed", "Email attachments", "Email export"];
  let previous = -1;
  for (const heading of headings) {
    const index = sidebar.indexOf(heading);
    assert.ok(index > previous, `${heading} follows the reference section order`);
    previous = index;
  }
  assert.match(sidebar, /styles.card.*styles.packageSidebar/);
  assert.doesNotMatch(sidebar, /<article|type="checkbox"|OwnerCheckpointPanel|Review \/ download|<select/);
  assert.doesNotMatch(source, /import.*OwnerCheckpointPanel/);
  assert.match(source, /href=\{`\$\{root\}\/review`\}/, "the existing document-review route remains reachable");
  assert.match(sidebar, /No approved attachments available yet/);
  assert.doesNotMatch(sidebar, /\d+(?:\.\d+)? MB|Acme|Northwind|API|contract/);
});

test("document review and download are separate actions using the guarded PPT2 adapter", () => {
  const source = readFileSync(new URL("../components/FollowUpDraftPanel.tsx", import.meta.url), "utf8");
  assert.match(source, /href=\{`\$\{root\}\/post-meeting-presentation`\}>Review<\/Link>/);
  assert.match(source, /onClick=\{\(\) => void downloadDocument\(\)\}/);
  assert.match(source, /disabled=\{!currentDocument\?\.downloads.pptx \|\| downloading\}/);
  assert.match(source, /downloadPostMeetingPresentation\(accessToken, opportunityId, currentDocument, "pptx", controller.signal\)/);
  assert.match(source, /result.deck\?\.presentationId !== presentationId \|\| result.deck.presentationVersionId !== presentationVersionId/);
  assert.match(source, /downloadOperation.current\?\.abort\(\)/);
  assert.match(source, /URL.revokeObjectURL\(url\)/);
  assert.doesNotMatch(source, /loadExistingFirstPitch|downloadLivePresentation/);
});

test("sidebar styles preserve the single-panel layout and stack on narrow screens", () => {
  const css = readFileSync(new URL("../components/post-meeting.module.css", import.meta.url), "utf8");
  assert.match(css, /\.followUpColumns\s*\{[^}]*align-items: stretch/);
  assert.match(css, /\.packageSidebar\s*\{[^}]*display: flex;[^}]*flex-direction: column/);
  assert.match(css, /\.packageExport\s*\{[^}]*margin-top: auto/);
  assert.match(css, /\.packageExport :global\(\.btn-primary\)\s*\{[^}]*width: 100%/);
  assert.match(css, /@media \(max-width: 960px\)\s*\{\s*\.columns, \.followUpColumns\s*\{\s*grid-template-columns: minmax\(0, 1fr\)/);
});

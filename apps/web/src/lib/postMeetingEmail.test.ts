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

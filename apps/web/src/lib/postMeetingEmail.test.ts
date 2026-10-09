import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { ApiRequestError } from "./api";
import {
  EMAIL_REVIEW_CHECKS, canPreparePostMeetingEmail, clipboardText, confirmPostMeetingEmail, contentWordCount, downloadEmailAttachment,
  emailError, emailExportable, emailFlagText, emailState, exportPostMeetingEmail, formatFileSize, generatePostMeetingEmail,
  isEmailConflict, isEmailHasEdits, loadPostMeetingEmail, parsePostMeetingEmail, saveFollowupStatics, savePostMeetingEmail,
  staticsFormFrom, staticsPayload, unsavedLengths, validateStaticsForm, workingCopy,
} from "./postMeetingEmail";
import type { PostMeetingWorkflow } from "./postMeeting";

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const presentation = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const version = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const text = (subject: string, body: string, edited = false) => ({ subject, body, word_count: 12, edited });
const attachment = (format: "pptx" | "pdf", selected: boolean, available = true) => ({
  format, file_name: `Master Presentation - Acme - V2.${format}`, selected, available, size_bytes: available ? 3_250_000 : null,
  presentation_id: presentation, presentation_version_id: version, version_number: 2, product_version: "V2",
});
const body = "Hi Dana,\n\nthank you for your time in our meeting.\n\nKey points\n- Quotes must go out within one day.\n\nBest regards\nJörg Müller\nManaging Partner - BOREK";
function envelope(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: "1.0", opportunity_id: id, journey_stage: "deepening",
    draft: {
      id: "draft-1", status: "draft", send_status: "not_sent", selected_length: null, revision: 3, confirmed_revision: null, confirmed_at: null,
      created_at: "2026-10-09T08:00:00Z", updated_at: "2026-10-09T09:00:00Z",
      lengths: { short: text("Short subject", body), medium: text("Medium subject", body, true), extensive: text("Long subject", body) },
      word_limits: { short: 150, medium: 300, extensive: 500 },
      source: { kind: "master_presentation_v2", product_version: "V2", finalized_at: "2026-10-09T07:00:00Z", presentation_id: presentation, presentation_version_id: version, version_number: 2, snapshot_hash: "a".repeat(64), extraction_execution_mode: "fixture", confirmed_finding_count: 6, excluded_finding_count: 1 },
      source_status: "valid", review_flags: ["fixture_extraction", "action_owner_unconfirmed"], review: null,
      recipients: { to: [{ name: "Dana Weber", email: "dana@acme.example" }], cc: [], sender: { name: "Jörg Müller", role: "Managing Partner", email: "joerg@borek.example" } },
      attachments: [attachment("pptx", false), attachment("pdf", true)],
      ...overrides,
    },
  };
}
const parsed = (overrides: Record<string, unknown> = {}) => parsePostMeetingEmail(envelope(overrides), id)!;

async function withFetch<T>(handler: (url: string, init: RequestInit | undefined) => Response, run: () => Promise<T>) {
  const original = globalThis.fetch;
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), method: init?.method ?? "GET", body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });
    return handler(String(input), init);
  };
  try { return { result: await run(), calls }; } finally { globalThis.fetch = original; }
}

test("the parser keeps all three lengths, the pinned source and the real attachment selection", () => {
  const draft = parsed();
  assert.equal(draft.revision, 3);
  assert.deepEqual([draft.lengths.short.subject, draft.lengths.medium.subject, draft.lengths.extensive.subject], ["Short subject", "Medium subject", "Long subject"]);
  assert.equal(draft.lengths.medium.edited, true);
  assert.deepEqual(draft.source, { presentationId: presentation, presentationVersionId: version, versionNumber: 2, finalizedAt: "2026-10-09T07:00:00Z", extractionMode: "fixture", confirmedFindings: 6, excludedFindings: 1 });
  assert.deepEqual(draft.attachments.map((item) => [item.format, item.selected, item.available]), [["pptx", false, true], ["pdf", true, true]]);
  assert.equal(draft.recipients?.to[0].email, "dana@acme.example");
  assert.equal(parsePostMeetingEmail({ ...envelope(), draft: null }, id), null);
  assert.throws(() => parsePostMeetingEmail({ ...envelope(), opportunity_id: "another" }, id), /does not belong/);
  assert.throws(() => parsePostMeetingEmail({ ...envelope(), journey_stage: "first_contact" }, id), /does not belong/);
  assert.throws(() => parsePostMeetingEmail({ ...envelope(), draft: {} }, id), /incomplete/);
  assert.throws(() => parsePostMeetingEmail(envelope({ send_status: "sent" }), id), /unexpected delivery state/, "a draft is never shown as sent");
  // A draft of an earlier opportunity: no source, nothing to attach.
  const legacy = parsed({ source: null, source_status: "not_applicable", attachments: [], review_flags: [] });
  assert.equal(legacy.source, null);
  assert.deepEqual(legacy.attachments, []);
});

test("preparation requires authoritative review and finalization, not merely a status label", () => {
  const workflow: PostMeetingWorkflow = { opportunity_id: id, current_status: "finalized", steps: [], documents: { ppt1: null, ppt2: null, approved_discovery: null }, finalization: null };
  assert.equal(canPreparePostMeetingEmail(workflow), false);
  workflow.steps = [{ key: "owner_review", state: "completed" }, { key: "finalized", state: "completed" }];
  assert.equal(canPreparePostMeetingEmail(workflow), false);
  workflow.finalization = { id: "snapshot-1" };
  assert.equal(canPreparePostMeetingEmail(workflow), true);
});

test("switching lengths keeps every unsaved edit, and the state follows what is saved", () => {
  const draft = parsed();
  const copy = workingCopy(draft);
  assert.deepEqual(unsavedLengths(draft, copy), []);
  assert.equal(emailState(draft, copy), "saved");
  copy.short = { ...copy.short, subject: "Edited short" };
  copy.extensive = { ...copy.extensive, body: `${body}\nPS` };
  assert.deepEqual(unsavedLengths(draft, copy), ["short", "extensive"], "both edits are still there after looking at another length");
  assert.equal(copy.medium.subject, "Medium subject");
  assert.equal(emailState(draft, copy), "unsaved");
  assert.equal(emailState(null, null), "none");

  const confirmed = parsed({ status: "confirmed", selected_length: "medium", confirmed_revision: 3, confirmed_at: "2026-10-09T10:00:00Z" });
  assert.equal(emailState(confirmed, workingCopy(confirmed)), "confirmed");
  assert.equal(emailExportable(confirmed), true);
  // Edited after confirmation, an older confirmation, or a changed package: not exportable.
  assert.equal(emailState(confirmed, { ...workingCopy(confirmed), medium: { subject: "Changed", body } }), "unsaved");
  assert.equal(emailExportable(parsed({ status: "confirmed", selected_length: "medium", confirmed_revision: 2 })), false);
  assert.equal(emailExportable(parsed({ status: "confirmed", selected_length: "medium", confirmed_revision: 3, source_status: "changed" })), false);
  assert.equal(emailExportable(draft), false);
  assert.equal(clipboardText(confirmed), `Subject: Medium subject\n\n${body}`);
  assert.throws(() => clipboardText(draft), /confirm/);
});

test("content words exclude greeting and signature, as the API counts them", () => {
  assert.equal(contentWordCount(body), 18);
  assert.equal(contentWordCount("Hi Dana,\r\n\r\none two three\r\n\r\nBest regards\r\nJ"), 3);
  assert.equal(formatFileSize(3_250_000), "3.1 MB");
  assert.equal(formatFileSize(20_480), "20 KB");
  assert.equal(formatFileSize(null), "");
});

test("saving names the revision it is based on and a stale save is recognised as a conflict", async () => {
  const draft = parsed();
  const saved = await withFetch(() => Response.json(envelope({ revision: 4, selected_length: "short" })), () =>
    savePostMeetingEmail("token", id, draft, { selectedLength: "short", lengths: { short: { subject: "Edited", body } }, attachments: { pptx: true } }));
  assert.equal(saved.result.revision, 4);
  assert.deepEqual(saved.calls.map((call) => [call.method, call.url.replace(/^.*\/opportunities/, "/opportunities")]), [["PATCH", `/opportunities/${id}/email-drafts/draft-1`]]);
  assert.deepEqual(saved.calls[0].body, { expected_revision: 3, selected_length: "short", lengths: { short: { subject: "Edited", body } }, attachments: { pptx: true } });

  const stale = () => new Response(JSON.stringify({ error: { code: "EMAIL_DRAFT_CONFLICT", message: "changed" } }), { status: 409, headers: { "Content-Type": "application/json" } });
  await assert.rejects(withFetch(stale, () => savePostMeetingEmail("token", id, draft, { lengths: { short: { subject: "Mine", body } } })), (error) => {
    assert.equal(isEmailConflict(error), true);
    assert.equal(isEmailHasEdits(error), false);
    assert.match(emailError(error), /changed elsewhere/);
    return true;
  });
  assert.equal(isEmailHasEdits(new ApiRequestError("x", 409, "EMAIL_DRAFT_HAS_EDITS")), true);
  assert.match(emailError(new ApiRequestError("The short draft has 160 content words; the limit is 150.", 400, "EMAIL_LENGTH_EXCEEDED")), /160 content words/);
  assert.match(emailError(new ApiRequestError("x", 409, "FOLLOWUP_SOURCE_CHANGED")), /Regenerate/);
});

test("generate, confirm and export call their own endpoints and never a delivery endpoint", async () => {
  const draft = parsed();
  const generated = await withFetch(() => Response.json(envelope({ revision: 1 })), () => generatePostMeetingEmail("token", id, true));
  assert.deepEqual(generated.calls[0].body, { journey_stage: "deepening", overwrite_edits: true });
  assert.match(generated.calls[0].url, /\/email-drafts\/generate$/);

  const checks = EMAIL_REVIEW_CHECKS.map(([key]) => key);
  assert.deepEqual(checks, ["recipients", "dates_and_owners", "supported_statements", "review_flags", "tone", "attachments"]);
  const confirmedEnvelope = envelope({ status: "confirmed", selected_length: "medium", revision: 4, confirmed_revision: 4, confirmed_at: "2026-10-09T10:00:00Z" });
  const confirmed = await withFetch(() => Response.json(confirmedEnvelope), () => confirmPostMeetingEmail("token", id, draft, "medium", checks));
  assert.match(confirmed.calls[0].url, /\/email-drafts\/draft-1\/confirm$/);
  assert.deepEqual(confirmed.calls[0].body, { selected_length: "medium", expected_revision: 3, review_checks: checks, acknowledged_flags: ["fixture_extraction", "action_owner_unconfirmed"] });

  await assert.rejects(() => exportPostMeetingEmail("token", id, draft), /confirm/, "an unconfirmed draft is not requested for export");
  const exported = await withFetch(() => new Response("From: a\r\n\r\nbody", { headers: { "Content-Type": "message/rfc822" } }), () => exportPostMeetingEmail("token", id, confirmed.result));
  assert.match(exported.calls[0].url, /\/email-drafts\/draft-1\/export\?revision=4$/);
  assert.equal(exported.calls[0].method, "GET");
  assert.equal(await exported.result.text(), "From: a\r\n\r\nbody");

  const file = await withFetch(() => new Response("PK"), () => downloadEmailAttachment("token", confirmed.result.attachments[1]));
  assert.match(file.calls[0].url, new RegExp(`/presentations/${presentation}/versions/${version}/download/pdf$`), "the pinned version, not the latest");
  await assert.rejects(() => downloadEmailAttachment("token", { ...confirmed.result.attachments[0], available: false }), /not available/);

  const loaded = await withFetch(() => Response.json(envelope()), () => loadPostMeetingEmail("token", id));
  assert.match(loaded.calls[0].url, new RegExp(`/opportunities/${id}/email-drafts\\?journey_stage=deepening$`));
  const every = [...generated.calls, ...confirmed.calls, ...exported.calls, ...file.calls, ...loaded.calls];
  assert.equal(every.some((call) => /\/send\b|smtp|sendMail/i.test(call.url)), false);
});

test("recipient and sender are entered by the owner and validated before saving", async () => {
  const empty = staticsFormFrom(null, { companyName: "Acme GmbH", contactPerson: "Dana Weber" });
  assert.deepEqual([empty.clientShort, empty.recipientFirstName, empty.recipientLastName, empty.recipientEmail, empty.senderEmail], ["Acme GmbH", "Dana", "Weber", "", ""], "names are prefilled from the contact person, addresses are never invented");
  assert.match(validateStaticsForm(empty) ?? "", /project name/);
  const form = { ...empty, projectName: "Acme Quoting", recipientEmail: "dana@acme.example", senderName: "Jörg Müller", senderRole: "Managing Partner", senderEmail: "joerg@borek.example" };
  assert.equal(validateStaticsForm(form), null);
  assert.match(validateStaticsForm({ ...form, recipientEmail: "dana" }) ?? "", /recipient's email/);
  assert.match(validateStaticsForm({ ...form, recipientFirstName: " " }) ?? "", /first name/);
  assert.match(validateStaticsForm({ ...form, style: "formal" }) ?? "", /salutation/);
  assert.equal(validateStaticsForm({ ...form, style: "formal", recipientSalutation: "Ms" }), null);
  assert.match(validateStaticsForm({ ...form, senderEmail: "" }) ?? "", /sender's email/);

  const previous = { project_name: "Old", client_short: "Acme", salutation_style: "informal", standard_recipients: [
    { email: "old@acme.example", first_name: "Old", kind: "to", primary: true }, { email: "cc@acme.example", first_name: "Tom", kind: "cc" },
  ], sender_profile: { name: "A", role: "B", email: "a@borek.example" } };
  const payload = staticsPayload(form, previous);
  assert.deepEqual(payload.standard_recipients.map((item) => [item.email, item.kind, item.primary ?? false]), [["dana@acme.example", "to", true], ["cc@acme.example", "cc", false]], "a stored Cc recipient is kept");
  assert.equal(staticsFormFrom(payload, { companyName: "x", contactPerson: "y z" }).recipientFirstName, "Dana");

  const saved = await withFetch(() => Response.json({ followup_statics: payload }), () => saveFollowupStatics("token", id, form, previous));
  assert.deepEqual(saved.calls.map((call) => [call.method, call.url.replace(/^.*\/opportunities/, "/opportunities")]), [["PATCH", `/opportunities/${id}`]]);
  assert.deepEqual(saved.calls[0].body, { followup_statics: payload });
});

test("review flags are explained in plain words, including that demo extraction is not live AI", () => {
  assert.match(emailFlagText("fixture_extraction"), /demo extraction, not from a live AI analysis/);
  assert.match(emailFlagText("owner_notes_omitted"), /not client statements/);
  assert.match(emailFlagText("action_date_unconfirmed"), /date to be confirmed/);
  assert.match(emailFlagText("something_new"), /something new/);
});

const panel = readFileSync(new URL("../components/FollowUpDraftPanel.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../components/post-meeting.module.css", import.meta.url), "utf8");

test("the email screen saves on the server, reviews the saved revision and never sends", () => {
  // Editing is held per length and saved through the API, not in browser storage.
  assert.match(panel, /setCopy\(\{ \.\.\.copy, \[length\]: \{ \.\.\.text, subject: event.target.value \} \}\)/);
  assert.match(panel, /setCopy\(\{ \.\.\.copy, \[length\]: \{ \.\.\.text, body: event.target.value \} \}\)/);
  assert.match(panel, /savePostMeetingEmail\(token, opportunityId, draft, \{ selectedLength: length, lengths \}\)/);
  assert.doesNotMatch(panel, /localStorage|sessionStorage/);
  assert.match(panel, /window.addEventListener\("beforeunload", warn\)/);
  // Conflict and regenerate are explicit decisions.
  assert.match(panel, /if \(isEmailConflict\(cause\)\) setConflict\(true\)/);
  assert.match(panel, /data-testid="email-conflict"/);
  assert.match(panel, /Load the saved version/);
  assert.match(panel, /Keep my text and review/);
  assert.match(panel, /data-testid="email-regenerate-warning"/);
  assert.match(panel, /Regenerating replaces all three lengths/);
  // The review is of the saved text and needs every check.
  assert.match(panel, /const allChecked = EMAIL_REVIEW_CHECKS.every\(\(\[key\]\) => checks.includes\(key\)\)/);
  assert.match(panel, /disabled=\{working \|\| dirty.length > 0\} data-testid="email-checklist"/);
  assert.match(panel, /&& dirty.length === 0 && !overLimit && !conflict && draft!.sourceStatus !== "changed"/);
  assert.match(panel, /setChecks\(\[\]\)/, "a new revision needs a new review");
  // Export only of a confirmed draft; every statement about delivery says that nothing is sent.
  assert.match(panel, /data-testid="email-export" disabled=\{!exportable \|\| working\}/);
  assert.match(panel, /data-testid="email-copy" disabled=\{!exportable \|\| working\}/);
  assert.match(panel, /Nothing is sent from this application/);
  assert.match(panel, /Draft confirmed\. Nothing was sent\./);
  assert.doesNotMatch(panel, /Send email|>Send<|mailto:|\/send|smtp/i, "the Figma 'Send email' action is an export here");
  assert.doesNotMatch(panel, /concretisation/);
});

test("the package sidebar shows the pinned V2 version and a real attachment selection", () => {
  const sidebar = panel.slice(panel.indexOf("<aside"), panel.indexOf("</aside>") + "</aside>".length);
  let previous = -1;
  for (const heading of ["Updated presentation", "What the email is based on", "Email attachments", "Email export"]) {
    const index = sidebar.indexOf(heading);
    assert.ok(index > previous, `${heading} follows the Figma section order`);
    previous = index;
  }
  assert.match(sidebar, /styles.card.*styles.packageSidebar/);
  assert.match(sidebar, /Open in Deck Center/);
  assert.match(sidebar, /draft\?\.attachments.map\(\(item\) => <button key=\{item.format\}/, "PPTX and PDF downloads of the pinned version");
  assert.match(sidebar, /never a newer one/);
  assert.match(sidebar, /type="checkbox" checked=\{item.selected\}/);
  assert.match(sidebar, /Not available — this file cannot be attached/);
  assert.match(sidebar, /A file that is not selected is not attached/);
  assert.match(sidebar, /not by a live AI analysis/);
  assert.doesNotMatch(sidebar, /\d+(?:\.\d+)? MB|Acme|Northwind|Opportunity Analysis\.pdf|Delivery Overview/, "no invented documents or sizes");
  // Earlier standalone PPT #2 opportunities keep their guarded download.
  assert.match(panel, /!master && !draft\?\.source \? <StandalonePresentationCard/);
  assert.match(panel, /downloadPostMeetingPresentation\(token, opportunityId, deck, "pptx"\)/);
  assert.doesNotMatch(panel, /loadExistingFirstPitch|downloadLivePresentation/);
});

test("layout follows the Figma frame and stacks on tablet and mobile", () => {
  assert.match(css, /\.followUpColumns\s*\{[^}]*align-items: stretch/);
  assert.match(css, /\.packageSidebar\s*\{[^}]*display: flex;[^}]*flex-direction: column/);
  assert.match(css, /\.packageExport\s*\{[^}]*margin-top: auto/);
  assert.match(css, /\.packageExport :global\(\.btn-primary\)\s*\{[^}]*width: 100%/);
  assert.match(css, /\.emailFields > div\s*\{[^}]*grid-template-columns: 96px minmax\(0, 1fr\)/, "label column as in the To / Subject rows");
  assert.match(css, /\.emailLengths\s*\{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.phaseNavThree\s*\{[^}]*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 960px\)\s*\{\s*\.columns, \.followUpColumns\s*\{\s*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /@media \(max-width: 640px\)[^\n]*\.emailStaticsGrid, \.emailLengths \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(css, /@media \(max-width: 640px\)[^\n]*\.emailFields > div, \.root \.emailSubject \{ grid-template-columns: minmax\(0, 1fr\)/);
  const shell = readFileSync(new URL("../components/PostMeetingShell.tsx", import.meta.url), "utf8");
  assert.match(shell, /<span>3<\/span><div><small>Follow-up email<\/small><strong>Review, confirm &amp; export<\/strong>/);
});

test("the email route has its own page title and is reachable from the finalized owner checkpoint", () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
  const header = read("../components/SiteHeader.tsx");
  assert.ok(header.includes("const followUpEmail = /^\\/opportunities\\/[^/]+\\/follow-up\\/?$/.test(pathname);"), "only the follow-up route");
  assert.match(header, /const title = followUpEmail\s+\? copy\.header\.followUpEmail\s+: pathname\.startsWith/);
  assert.ok(header.includes('{followUpEmail ? <p className="pitch-page-subtitle">{copy.header.followUpEmailSubtitle}</p> : null}'));
  assert.ok(header.includes("? copy.header.pitchGeneration"), "other pitch routes keep their title");
  const route = /^\/opportunities\/[^/]+\/follow-up\/?$/;
  assert.deepEqual(["/opportunities/abc/follow-up", "/opportunities/abc/follow-up/", "/opportunities/abc/meeting", "/opportunities/abc/post-meeting-presentation", "/opportunities/new/client-information", "/clients"].map((path) => route.test(path)),
    [true, true, false, false, false, false]);
  const language = read("../components/LanguageProvider.tsx");
  assert.ok(language.includes('followUpEmail: "Follow-up Email", followUpEmailSubtitle: "Review, edit and prepare your client follow-up."'));
  assert.ok(language.includes('followUpEmail: "Follow-up-E-Mail"'));
  const checkpoint = read("../components/OwnerCheckpointPanel.tsx");
  assert.match(checkpoint, /\{finalized\s+\? <div className=\{styles\.nextStep\} data-testid="finalized-next-step"/, "shown only once the documents are finalized");
  assert.ok(checkpoint.includes('data-testid="continue-to-follow-up" href={`/opportunities/${encodeURIComponent(opportunityId)}/follow-up`}>Continue to the follow-up email</Link>'));
  assert.ok(checkpoint.includes("disabled={disabled || !identity || confirmation !== identity || !reviewed} onClick={() => void act(true)}>Finalize documents"), "the finalization gate is unchanged");
  assert.ok(panel.includes('<PostMeetingPhaseNav opportunityId={opportunityId} active="review" />'));
  assert.ok(read("../components/PostMeetingPresentationWorkspace.tsx").includes("<Link href={`${root}/follow-up`}>Follow-up email</Link>"));
});

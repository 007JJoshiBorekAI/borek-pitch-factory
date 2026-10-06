import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

import { ApiRequestError } from "./api.js";
import { DISCOVERY_PAGE_CATALOG } from "./discoveryFirst.js";
import { canApproveDiscovery, canDownloadDiscoveryPdf, type DiscoveryWorkspaceVersion } from "./discoveryWorkspace.js";
import {
  adaptLiveDiscovery,
  approveLiveDiscovery,
  emptyLiveDiscovery,
  formatDiscoveryContent,
  generateLiveDiscovery,
  loadLiveDiscovery,
} from "./liveDiscovery.js";

async function run() {
  const paper = JSON.parse(readFileSync("../../packages/contracts/fixtures/discovery_paper.ready.json", "utf8"));
  const backendId: string = paper.opportunity_id;
  const localId = "opp-local-discovery";
  const versionId = "33333333-3333-4333-8333-333333333333";
  const metadata = {
    id: versionId, opportunity_id: backendId, document_id: paper.document_id, version_number: 2,
    status: "draft", created_at: "2026-10-05T08:00:00Z", updated_at: "2026-10-05T08:00:00Z", approved_at: null,
  };
  // Keep the exact seven schema content shapes, with distinct grounded pages and real source fields.
  for (const index of [3, 4]) {
    paper.pages[index].content = {
      availability: "grounded", title: `Grounded title ${index}`, statement: `Distinct source statement ${index}`,
      origin: "SOURCE_FACT", source_refs: [{ source_id: `fact-${index}`, locator: `corpus-v2/document-${index}`, excerpt: `Evidence ${index}` }],
    };
  }
  const original = structuredClone(paper);
  const adapted = adaptLiveDiscovery({ ...paper, pages: [...paper.pages].reverse() }, localId, backendId, metadata);
  assert.deepEqual(adapted.pages.map((page) => page.id), DISCOVERY_PAGE_CATALOG.map((page) => page.id));
  const distinctContent = ["Northwind", "Unknown company facts", "Meeting purpose:", "Distinct source statement 3", "Distinct source statement 4", "A discovery pilot", "Confirm Warehouse slotting"];
  adapted.pages.forEach((page, index) => {
    assert.ok(page.body.includes(distinctContent[index]), `page ${index + 1} must render its own structured content`);
    assert.deepEqual(page.content, paper.pages[index].content);
    assert.doesNotMatch(page.body, /\[object Object\]|Acme|Fixture evidence/);
  });
  assert.equal(adapted.pages[3].source_references[0].label, "fact-3");
  assert.equal(adapted.pages[3].source_references[0].detail, "corpus-v2/document-3\nEvidence 3");
  assert.match(adapted.pages[1].body, /Origin: USER_INPUT/);
  assert.match(adapted.pages[1].body, /Unknowns:[\s\S]*description/);
  assert.match(adapted.pages[5].body, /Commercial terms: not_included/);
  assert.match(formatDiscoveryContent({ title: "Title", summary: "Summary", bullets: ["First", "Second"], unknown: null }), /Title: Title\n\nSummary: Summary\n\nBullets: - First\n- Second\n\nUnknown: Not supplied/);
  assert.deepEqual(paper, original);
  assert.equal(adapted.source, "live");
  assert.equal(adapted.opportunity_id, localId);
  assert.equal(adapted.version_id, versionId);
  assert.equal(adapted.live?.version_number, 2);
  assert.equal(canApproveDiscovery(adapted), true, "the actual backend approval gate has no PDF requirement");
  assert.equal(canDownloadDiscoveryPdf(adapted), false);
  assert.equal(canDownloadDiscoveryPdf({ ...adapted, pdf_artifact_id: "not-a-real-file", pdf_download_url: "/fake.pdf", pdf_source_revision: adapted.revision }), false);
  assert.equal(adapted.pdf_artifact_id, null);
  assert.equal(adapted.pdf_download_url, null);
  assert.equal(canApproveDiscovery(adaptLiveDiscovery(paper, localId, backendId)), false, "wait for matching draft metadata");
  const approvedEnvelope = { ...metadata, status: "approved", approved_at: "2026-10-05T09:00:00Z", paper_json: { ...paper, latest_approved_version_id: versionId } };
  const approved = adaptLiveDiscovery(approvedEnvelope, localId, backendId);
  assert.equal(approved.document_state, "approved");
  assert.equal(approved.version_id, versionId);
  assert.equal(canApproveDiscovery(approved), false);
  assert.throws(() => adaptLiveDiscovery(paper, localId, "wrong-opportunity"), /another opportunity/);
  assert.throws(() => adaptLiveDiscovery(paper, localId, backendId, { ...metadata, document_id: "old-document" }), /does not match/);
  assert.throws(() => adaptLiveDiscovery({ ...paper, pages: paper.pages.slice(1) }, localId, backendId), /incomplete/);
  assert.throws(() => adaptLiveDiscovery({ ...paper, pages: paper.pages.map((page: object) => ({ ...page, status: "waiting", content: null })) }, localId, backendId), /statuses do not agree/);

  const emptyPaper = {
    ...paper, status: "not_generated", document_id: null, generated_at: null,
    pages: paper.pages.map((page: object) => ({ ...page, status: "waiting", content: null })),
  };
  const progressPaper = {
    ...paper, status: "generating",
    pages: paper.pages.map((page: object, index: number) => index < 3 ? page : { ...page, status: index === 3 ? "generating" : "waiting", content: null }),
  };
  const failedPaper = {
    ...progressPaper, status: "failed",
    pages: progressPaper.pages.map((page: object, index: number) => index === 3 ? { ...page, status: "failed" } : page),
  };
  const empty = emptyLiveDiscovery(localId);
  assert.equal(empty.live?.status, "not_generated");
  assert.ok(empty.pages.every((page) => page.body === "" && page.state === "waiting"));
  assert.equal(canApproveDiscovery(empty), false);
  const failed = adaptLiveDiscovery(failedPaper, localId, backendId);
  assert.deepEqual(failed.pages.slice(0, 3), adapted.pages.slice(0, 3));
  assert.equal(failed.pages[3].state, "failed");
  assert.match(failed.pages[3].failure_message!, /No page retry endpoint/);
  assert.equal(canApproveDiscovery(failed), false);

  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalSession = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    localStorage: { getItem: () => JSON.stringify({ [localId]: backendId }), setItem: () => assert.fail("loading must not create a backend mapping") },
  } });
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: {
    getItem: (key: string) => key === "borek.authUserId" ? "test-owner" : null,
  } });
  const calls: { path: string; method: string }[] = [];
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
  let handle: (path: string, method: string) => Response | Promise<Response> = () => assert.fail("unexpected request");
  globalThis.fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    const method = init?.method ?? "GET";
    calls.push({ path, method });
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer test-token");
    return handle(path, method);
  };
  try {
    const path = `/opportunities/${backendId}/discovery-paper`;
    // Loading an unmapped local id is explicit empty, never a fixture and never a POST.
    assert.equal((await loadLiveDiscovery("test-token", "opp-unmapped")).live?.status, "not_generated");
    assert.equal(calls.length, 0);
    handle = (url) => url.endsWith("/versions") ? json({ versions: [
      { ...metadata, document_id: "older-document", version_number: 99, status: "approved" },
      { ...metadata, version_number: 1, status: "approved" }, metadata,
    ] }) : json(paper);
    assert.deepEqual(await loadLiveDiscovery("test-token", localId), adapted);
    assert.deepEqual(calls.map((call) => call.path), [path, `${path}/versions`]);
    assert.equal((await loadLiveDiscovery("test-token", backendId)).opportunity_id, backendId);

    handle = () => json(emptyPaper);
    assert.equal((await loadLiveDiscovery("test-token", backendId)).live?.status, "not_generated");
    handle = () => json({ error: { message: "No paper" } }, 404);
    assert.deepEqual(await loadLiveDiscovery("test-token", localId), empty);
    for (const status of [401, 403, 500]) {
      handle = () => json({ error: { message: "Load failed" } }, status);
      await assert.rejects(loadLiveDiscovery("test-token", localId), (error: unknown) => error instanceof ApiRequestError && error.status === status);
    }
    handle = () => json({ status: "ready" });
    await assert.rejects(loadLiveDiscovery("test-token", localId));
    handle = (url) => url.endsWith("/versions") ? json({ versions: [] }) : json(failedPaper);
    assert.deepEqual(await loadLiveDiscovery("test-token", localId), failed);

    // Publish returned content even if the metadata request fails, but do not invent a version.
    const received: DiscoveryWorkspaceVersion[] = [];
    handle = (url) => url.endsWith("/versions") ? json({ error: { message: "Metadata unavailable" } }, 503) : json(paper);
    await assert.rejects(loadLiveDiscovery("test-token", localId, { onPaper: (value) => received.push(value) }), /Metadata unavailable/);
    assert.equal(received.length, 1);
    assert.deepEqual(received[0].pages, adapted.pages);
    assert.equal(canApproveDiscovery(received[0]), false);

    const lateLoadController = new AbortController();
    handle = () => { lateLoadController.abort(); return json(paper); };
    await assert.rejects(loadLiveDiscovery("test-token", localId, {
      signal: lateLoadController.signal, onPaper: () => assert.fail("late load must not publish into a changed scope"),
    }), (error: unknown) => error instanceof DOMException && error.name === "AbortError");

    const lateMetadataController = new AbortController();
    handle = (url) => {
      if (url.endsWith("/versions")) {
        lateMetadataController.abort();
        return json({ versions: [metadata] });
      }
      return json(paper);
    };
    await assert.rejects(loadLiveDiscovery("test-token", localId, { signal: lateMetadataController.signal }),
      (error: unknown) => error instanceof DOMException && error.name === "AbortError");

    calls.length = 0;
    let finishGeneration!: (response: Response) => void;
    const generationResponse = new Promise<Response>((resolve) => { finishGeneration = resolve; });
    handle = (url, method) => {
      if (method === "POST") {
        assert.equal(url, `${path}/generate`);
        return generationResponse;
      }
      return url.endsWith("/versions") ? json({ versions: [metadata] }) : json(progressPaper);
    };
    const progressive: DiscoveryWorkspaceVersion[] = [];
    const generating = generateLiveDiscovery("test-token", localId, undefined, { onPaper: (value) => progressive.push(value) });
    await delay(850);
    assert.equal(progressive[0]?.live?.status, "generating");
    assert.deepEqual(progressive[0].pages.slice(0, 3), adapted.pages.slice(0, 3));
    finishGeneration(json(paper));
    assert.deepEqual(await generating, adapted, "generation must consume its returned paper, not an older GET or fixture");
    assert.equal(calls.filter((call) => call.method === "POST").length, 1);
    assert.equal(calls.at(-1)?.path, `${path}/versions`);
    assert.equal(progressive.at(-1)?.live?.status, "ready");

    handle = (url, method) => {
      assert.equal(url, `${path}/approve`);
      assert.equal(method, "POST");
      return json(approvedEnvelope);
    };
    assert.deepEqual(await approveLiveDiscovery("test-token", localId), approved);
    handle = () => json({ error: { message: "No draft version" } }, 400);
    await assert.rejects(approveLiveDiscovery("test-token", localId), /No draft version/);
    handle = () => json({ error: { message: "Page failed" } }, 400);
    await assert.rejects(generateLiveDiscovery("test-token", localId, undefined), /Page failed/);

    // Cancellation ignores a late generation payload and prevents metadata reads/publication.
    const controller = new AbortController();
    handle = () => { controller.abort(); return json(paper); };
    await assert.rejects(generateLiveDiscovery("test-token", localId, undefined, {
      signal: controller.signal, onPaper: () => assert.fail("cancelled payload published"),
    }), (error: unknown) => error instanceof DOMException && error.name === "AbortError");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (originalSession) Object.defineProperty(globalThis, "sessionStorage", originalSession);
    else Reflect.deleteProperty(globalThis, "sessionStorage");
    if (supabaseUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = supabaseUrl;
  }
  console.log("Live Discovery adaptation and API behavior tests passed");
}

void run().catch((error) => { console.error(error); process.exitCode = 1; });

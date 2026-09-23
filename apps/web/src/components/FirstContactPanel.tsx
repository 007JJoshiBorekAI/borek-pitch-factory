"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { SiteHeader } from "@/components/SiteHeader";
import { StageStepper } from "@/components/StageChrome";
import { useAuth } from "@/components/AuthProvider";
import {
  generateStage1Outputs,
  getOpportunity,
  getStage1Outputs,
  listClientDocuments,
  type Stage1OutputsEnvelope,
} from "@/lib/api";
import { formatStage1Fact } from "@/lib/stage1Display";

export function FirstContactPanel() {
  const router = useRouter();
  const params = useSearchParams();
  const opportunityId = params.get("opportunityId")?.trim() || "";
  const { accessToken, session } = useAuth();
  const [clientName, setClientName] = useState("");
  const [opportunityName, setOpportunityName] = useState("");
  const [envelope, setEnvelope] = useState<Stage1OutputsEnvelope | null>(null);
  const [documentCount, setDocumentCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken || !opportunityId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const opportunity = await getOpportunity(accessToken, opportunityId);
      const [outputs, documents] = await Promise.all([
        getStage1Outputs(accessToken, opportunityId),
        listClientDocuments(accessToken, opportunityId),
      ]);
      setClientName(opportunity.client_name);
      setOpportunityName(opportunity.opportunity_name);
      setEnvelope(outputs);
      setDocumentCount(documents.length);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The meeting brief could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, opportunityId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleGenerate() {
    if (!accessToken || !opportunityId) return;
    setBusy(true);
    setError(null);
    try {
      setEnvelope(await generateStage1Outputs(accessToken, opportunityId));
      setDocumentCount((await listClientDocuments(accessToken, opportunityId)).length);
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "The brief could not be generated.");
    } finally {
      setBusy(false);
    }
  }

  const ready = envelope?.status === "ready" && envelope.outputs;
  const research = ready ? envelope.outputs?.research : null;
  const facts = research?.company_facts;
  const questionCount = ready ? envelope.outputs?.discovery_questions.length ?? 0 : 0;

  return (
    <div className="app-workspace">
      <SiteHeader signedInEmail={session?.user.email} />
      <main className="app-shell app-workspace-body">
        {!opportunityId ? (
          <section className="recent-empty">
            <h2>Start with a client</h2>
            <p>Create a pitch to generate the first-meeting brief.</p>
            <Link href="/" className="btn btn-primary">Start a new pitch</Link>
          </section>
        ) : null}
        {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
        {loading ? <p>Loading the meeting brief...</p> : null}
        {opportunityId && !loading ? (
          <>
            <p className="pitch-breadcrumb">
              <Link href="/clients">Clients</Link> / <span>{clientName}</span> / <span>{opportunityName}</span>
            </p>
            <div className="title-row" style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "flex-start" }}>
              <div>
                <h2 className="pitch-greet">Stage 1 · First contact</h2>
                <p className="pitch-status-line">
                  {ready ? "Information pack ready" : "New prospect · First meeting preparation"}
                </p>
                <p className="pitch-subtle pitch-lead">
                  Understand the client, opportunity and prepare the first conversation.
                </p>
              </div>
              {ready ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => router.push(`/first-meeting?opportunityId=${encodeURIComponent(opportunityId)}`)}
                >
                  Continue to first meeting →
                </button>
              ) : (
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void handleGenerate()}>
                  {busy ? "Generating..." : "Generate meeting brief"}
                </button>
              )}
            </div>
            <StageStepper activeIndex={0} />
            <div className="pitch-stage-cols">
              <div className="pitch-left-col">
                <div className="pitch-panel-label">Stage 1</div>
                <p className="pitch-panel-desc">First contact · output is the meeting brief below.</p>
                <div className="pitch-input-item active">
                  <div className="name">Meeting brief</div>
                  <div className="meta">{ready ? "Ready" : "Not generated"}</div>
                </div>
                <div className="pitch-input-item">
                  <div className="name">Client documents</div>
                  <div className="meta">{documentCount} uploaded</div>
                </div>
                <p className="pitch-footnote">First-meeting deck stays unfrozen until the presentation profile is released.</p>
              </div>

              <div>
                <h3 className="pitch-mid-title">First meeting preparation</h3>
                {!ready ? (
                  <p className="pitch-subtle">
                    {documentCount === 0
                      ? "Add client documents on the new-pitch form, then generate the brief."
                      : "Generate the brief from your intake and uploaded documents."}
                  </p>
                ) : (
                  <>
                    <div className="pitch-info-card" style={{ marginBottom: "1rem" }}>
                      <span>Information pack</span>
                      <p className="pitch-subtle" style={{ margin: 0 }}>
                        Research checked · {documentCount} source{documentCount === 1 ? "" : "s"} · editable after generation
                      </p>
                    </div>
                    <div className="pitch-panel-label">Who is the client?</div>
                    <p className="pitch-subtle">{formatStage1Fact(facts?.description)}</p>
                    <div className="pitch-card-row">
                      <div className="pitch-info-card">
                        <span>HQ</span>
                        <p style={{ margin: 0 }}>{formatStage1Fact(facts?.headquarters)}</p>
                      </div>
                      <div className="pitch-info-card">
                        <span>Employees</span>
                        <p style={{ margin: 0 }}>{formatStage1Fact(facts?.employee_headcount)}</p>
                      </div>
                    </div>
                    <div className="pitch-info-card">
                      <span>Decision makers</span>
                      <p style={{ margin: 0 }}>{formatStage1Fact(facts?.decision_makers)}</p>
                    </div>
                    <div className="pitch-info-card">
                      <span>Initial Borek hypothesis</span>
                      <p style={{ margin: 0 }}>
                        {envelope.outputs?.hypothesis.statement?.trim()
                          || research?.hypothesis?.text?.trim()
                          || "Unknown / not generated yet"}
                      </p>
                    </div>
                    <div className="pitch-info-card">
                      <span>Relevant services</span>
                      <p style={{ margin: 0 }}>
                        {envelope.outputs?.product_relevance.statement?.trim()
                          || research?.product_relevance?.text?.trim()
                          || "Unknown / not generated yet"}
                      </p>
                    </div>
                    <div className="pitch-panel-label">Discovery questions</div>
                    <p className="pitch-subtle">{questionCount} questions selected for the first meeting.</p>
                    <ul className="pitch-subtle" style={{ paddingLeft: "1.1rem", marginTop: 0 }}>
                      {(envelope.outputs?.discovery_questions ?? []).slice(0, 6).map((item) => (
                        <li key={item.id}>{item.text}</li>
                      ))}
                    </ul>
                    {(envelope.outputs?.discovery_questions.length ?? 0) > 6 ? (
                      <p className="pitch-footnote">
                        + {(envelope.outputs?.discovery_questions.length ?? 0) - 6} more in the full brief
                      </p>
                    ) : null}
                    <div className="pitch-panel-label">Agenda</div>
                    <p className="pitch-subtle" style={{ fontWeight: 600 }}>{envelope.outputs?.agenda.title}</p>
                    <ol style={{ marginTop: 0 }}>
                      {(envelope.outputs?.agenda.items ?? []).map((item) => (
                        <li key={item.order}>{item.label}</li>
                      ))}
                    </ol>
                  </>
                )}
                <div className="pitch-split-actions">
                  <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void load()}>
                    Refresh
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy || documentCount === 0}
                    onClick={() => void handleGenerate()}
                  >
                    {busy ? "Working..." : "Regenerate brief"}
                  </button>
                </div>
              </div>

              <aside className="pitch-right-panel">
                <div className="pitch-panel-label">Outputs</div>
                <h3>{ready ? "4 of 4" : "0 of 4"} preparation items</h3>
                <div className="pitch-thin-bar">
                  <span style={{ width: ready ? "100%" : "0%" }} />
                </div>
                <ul className="pitch-subtle" style={{ paddingLeft: "1.1rem" }}>
                  <li>Company profile · {ready ? "ready" : "pending"}</li>
                  <li>Service overview · {ready ? "ready" : "pending"}</li>
                  <li>Discovery questions · {ready ? "ready" : "pending"}</li>
                  <li>First-meeting deck · {ready ? "review (unfrozen)" : "pending"}</li>
                </ul>
                {ready ? (
                  <button
                    type="button"
                    className="btn btn-primary pitch-block-btn"
                    onClick={() => router.push(`/first-meeting?opportunityId=${encodeURIComponent(opportunityId)}`)}
                  >
                    Open first meeting →
                  </button>
                ) : null}
              </aside>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}

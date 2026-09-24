"use client";

import { useCallback, useEffect, useState } from "react";

import { FollowupProjectStaticsSection } from "@/components/FollowupProjectStaticsSection";
import {
  confirmEmailDraft,
  generateClientPreparationEmail,
  generateEmailDrafts,
  getClientPreparationEmail,
  getEmailDrafts,
  type ClientPreparationEmailEnvelope,
  type EmailDraftEnvelope,
  type EmailDraftLength,
  type JourneyEmailStage,
} from "@/lib/api";

type SectionMode =
  | { kind: "client-preparation" }
  | { kind: "journey"; journeyStage: JourneyEmailStage };

const LENGTHS: EmailDraftLength[] = ["short", "medium", "extensive"];

const LENGTH_LABELS: Record<EmailDraftLength, string> = {
  short: "Short",
  medium: "Medium",
  extensive: "Extensive",
};

type EmailDraftTemplateSectionProps = {
  accessToken: string | null;
  opportunityId: string;
  mode: SectionMode;
  title: string;
  description: string;
  /** When false, the section shows a hint instead of calling generate. */
  canGenerate?: boolean;
  generateBlockedHint?: string;
};

export function EmailDraftTemplateSection({
  accessToken,
  opportunityId,
  mode,
  title,
  description,
  canGenerate = true,
  generateBlockedHint,
}: EmailDraftTemplateSectionProps) {
  const [clientPrep, setClientPrep] = useState<ClientPreparationEmailEnvelope | null>(null);
  const [journeyDraft, setJourneyDraft] = useState<EmailDraftEnvelope | null>(null);
  const [selectedLength, setSelectedLength] = useState<EmailDraftLength>("short");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedNote, setConfirmedNote] = useState<string | null>(null);
  const [staticsReady, setStaticsReady] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken || !opportunityId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (mode.kind === "client-preparation") {
        setClientPrep(await getClientPreparationEmail(accessToken, opportunityId));
        setJourneyDraft(null);
      } else {
        const envelope = await getEmailDrafts(accessToken, opportunityId, mode.journeyStage);
        setJourneyDraft(envelope);
        setClientPrep(null);
        const preferred = envelope.draft?.selected_length;
        if (preferred) setSelectedLength(preferred);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The email draft could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, mode, opportunityId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleGenerate() {
    if (!accessToken || !opportunityId || !canGenerate || !staticsReady) return;
    setBusy(true);
    setError(null);
    setConfirmedNote(null);
    try {
      if (mode.kind === "client-preparation") {
        setClientPrep(await generateClientPreparationEmail(accessToken, opportunityId));
      } else {
        setJourneyDraft(await generateEmailDrafts(accessToken, opportunityId, mode.journeyStage));
      }
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "The email draft could not be generated.");
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
    if (!accessToken || !opportunityId || mode.kind !== "journey" || !journeyDraft?.draft) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await confirmEmailDraft(
        accessToken,
        opportunityId,
        journeyDraft.draft.id,
        selectedLength,
      );
      setJourneyDraft(updated);
      setConfirmedNote(`Saved ${LENGTH_LABELS[selectedLength]} draft for review (not sent).`);
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : "The draft could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  const clientReady = clientPrep?.status === "ready" && clientPrep.email;
  const journeyReady = Boolean(journeyDraft?.draft);
  const activeBody =
    mode.kind === "client-preparation"
      ? clientPrep?.email
      : journeyDraft?.draft?.lengths[selectedLength];
  const draftConfirmed =
    mode.kind === "journey" &&
    journeyDraft?.draft?.status === "confirmed" &&
    journeyDraft.draft.selected_length === selectedLength;

  const generateAllowed = canGenerate && staticsReady;
  const staticsBlockedHint =
    "Save project email settings (project name, recipients, sender) before generating the MS-32 email draft.";

  return (
    <section style={{ marginTop: "1.75rem" }}>
      <FollowupProjectStaticsSection
        accessToken={accessToken}
        opportunityId={opportunityId}
        onReadyChange={setStaticsReady}
        disabled={busy}
      />
      <div className="pitch-panel-label">Email draft</div>
      <h4 className="pitch-mid-title" style={{ fontSize: "1.15rem", marginBottom: "0.35rem" }}>{title}</h4>
      <p className="pitch-subtle" style={{ marginTop: 0 }}>{description}</p>
      {error ? (
        <div className="alert alert-error" role="alert" style={{ marginTop: "0.75rem" }}>
          {error}
        </div>
      ) : null}
      {loading ? <p className="pitch-subtle">Loading email draft…</p> : null}
      {!loading && mode.kind === "journey" && journeyReady ? (
        <div className="pitch-email-lengths" role="tablist" aria-label="Draft length">
          {LENGTHS.map((length) => (
            <button
              key={length}
              type="button"
              role="tab"
              className={selectedLength === length ? "active" : ""}
              aria-selected={selectedLength === length}
              onClick={() => setSelectedLength(length)}
            >
              {LENGTH_LABELS[length]}
            </button>
          ))}
        </div>
      ) : null}
      {!loading && activeBody ? (
        <div className="pitch-email-draft-box">
          <strong>Subject: {activeBody.subject}</strong>
          <hr />
          {activeBody.body}
        </div>
      ) : null}
      {!loading && !activeBody ? (
        <p className="pitch-subtle">
          {!staticsReady
            ? staticsBlockedHint
            : canGenerate
              ? "No draft yet. Generate one from the brief and saved project settings."
              : generateBlockedHint ?? "Complete the steps above before generating an email draft."}
        </p>
      ) : null}
      {!loading && activeBody ? (
        <p className="pitch-footnote">
          Editable draft · Confirm stores your review choice; mail is never sent from this app.
          {mode.kind === "client-preparation" && clientReady
            ? ` · ${clientPrep?.email?.word_count ?? 0} words`
            : ""}
          {mode.kind === "journey" && activeBody ? ` · ${activeBody.word_count} words` : ""}
        </p>
      ) : null}
      <div className="pitch-split-actions" style={{ marginTop: "0.75rem" }}>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void load()}>
          Refresh
        </button>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy || !generateAllowed}
            onClick={() => void handleGenerate()}
          >
            {busy ? "Working…" : activeBody ? "Regenerate" : "Generate draft"}
          </button>
          {mode.kind === "journey" && journeyReady ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || draftConfirmed}
              onClick={() => void handleConfirm()}
            >
              {draftConfirmed ? "Draft saved" : "Use this draft"}
            </button>
          ) : null}
        </div>
      </div>
      {confirmedNote ? <p className="pitch-status-line">{confirmedNote}</p> : null}
    </section>
  );
}

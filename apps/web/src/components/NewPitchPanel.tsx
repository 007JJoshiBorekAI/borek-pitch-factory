"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { displayNameFromEmail, SiteHeader } from "@/components/SiteHeader";
import { useAuth } from "@/components/AuthProvider";
import {
  createOpportunity,
  generateStage1Outputs,
  uploadClientDocument,
  uploadClientLogo,
} from "@/lib/api";
import { validateClientDocumentFile } from "@/lib/clientDocument";
import { validateClientLogoFile } from "@/lib/clientIntake";
import { buildIntakeNotesFile, buildStage1Intake } from "@/lib/stage1Prepare";
import {
  emptyPitchDraft,
  informationWithDraft,
  savePitchDraft,
  type PitchDraft,
} from "@/lib/pitchDraft";
import { getFileExtension, validateTranscriptFileName } from "@/lib/transcriptFormats";

export function NewPitchPanel() {
  const router = useRouter();
  const { accessToken, session, employee } = useAuth();
  const email = session?.user.email ?? employee?.email ?? null;
  const ownerName = displayNameFromEmail(email);
  const [draft, setDraft] = useState<PitchDraft>(() => emptyPitchDraft({ owner: ownerName === "Signed in" ? "" : ownerName }));
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!email) return;
    setDraft((current) => (current.owner ? current : { ...current, owner: displayNameFromEmail(email) }));
  }, [email]);

  function update(key: keyof PitchDraft, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function handlePrepare() {
    if (!accessToken) {
      setError("Sign in before starting a pitch.");
      return;
    }
    if (!draft.client.trim() || !draft.pitchTitle.trim()) {
      setError("Add a pitch title and a client.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await createOpportunity(accessToken, {
        client_name: draft.client.trim(),
        opportunity_name: draft.pitchTitle.trim(),
        department: draft.service.trim() || "General",
        language: "en",
        pitch_description: draft.description.trim() || undefined,
        team_members_text: draft.team.trim() || undefined,
        pii_redaction_enabled: true,
        additional_client_information: informationWithDraft(null, draft),
        stage1_intake: buildStage1Intake(draft),
      });
      savePitchDraft(created.id, draft);
      let uploadedClientDocument = false;
      for (const file of files) {
        const logo = validateClientLogoFile(file);
        if (logo.ok) {
          await uploadClientLogo(accessToken, created.id, file);
          continue;
        }
        const clientDoc = validateClientDocumentFile(file);
        if (clientDoc.ok) {
          await uploadClientDocument(accessToken, created.id, file);
          uploadedClientDocument = true;
          continue;
        }
        const extension = getFileExtension(file.name);
        if (extension === ".vtt" || extension === ".srt") {
          throw new Error(
            `${file.name}: meeting transcripts belong after the first meeting. Use PDF, DOCX, or TXT client documents for Stage 1.`,
          );
        }
        const transcript = validateTranscriptFileName(file.name);
        if (transcript.ok) {
          await uploadClientDocument(accessToken, created.id, file);
          uploadedClientDocument = true;
          continue;
        }
        throw new Error(`${file.name}: use PDF, DOCX, or TXT for client documents, or a PNG, JPEG, or WebP logo.`);
      }
      if (!uploadedClientDocument) {
        await uploadClientDocument(accessToken, created.id, buildIntakeNotesFile(draft));
      }
      try {
        await generateStage1Outputs(accessToken, created.id);
      } catch {
        // First-contact screen can regenerate if generation fails (e.g. API timeout).
      }
      router.push(`/first-contact?opportunityId=${encodeURIComponent(created.id)}`);
    } catch (prepareError) {
      setError(prepareError instanceof Error ? prepareError.message : "The pitch could not be started.");
      setBusy(false);
    }
  }

  return (
    <div className="app-workspace">
      <SiteHeader signedInEmail={email} />
      <main className="app-shell app-workspace-body">
        <h2 className="pitch-greet">Start a new pitch</h2>
        <p className="pitch-subtle pitch-lead">Give us the client. We will prepare the first meeting.</p>
        {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
        <div className="pitch-body-cols">
          <div className="pitch-form-col">
            <div className="pitch-form-row">
              <label>
                <span className="pitch-field-label">Pitch Name / Title</span>
                <input className="pitch-field" value={draft.pitchTitle} onChange={(event) => update("pitchTitle", event.target.value)} />
              </label>
              <label>
                <span className="pitch-field-label">Client</span>
                <input className="pitch-field" value={draft.client} onChange={(event) => update("client", event.target.value)} />
              </label>
            </div>
            <div className="pitch-form-row">
              <label>
                <span className="pitch-field-label">Service / Solution</span>
                <input className="pitch-field" value={draft.service} onChange={(event) => update("service", event.target.value)} />
              </label>
              <label>
                <span className="pitch-field-label">Business Need / Opportunity</span>
                <input className="pitch-field" value={draft.businessNeed} onChange={(event) => update("businessNeed", event.target.value)} />
              </label>
            </div>
            <label>
              <span className="pitch-field-label">Pitch Description</span>
              <textarea className="pitch-field" placeholder="Short overview of the pitch" value={draft.description} onChange={(event) => update("description", event.target.value)} />
            </label>
            <div className="pitch-section-label">Ownership</div>
            <div className="pitch-form-row">
              <label>
                <span className="pitch-field-label">Pitch Owner</span>
                <input className="pitch-field" value={draft.owner} onChange={(event) => update("owner", event.target.value)} />
              </label>
              <label>
                <span className="pitch-field-label">Team Members</span>
                <input className="pitch-field" placeholder="Add team members..." value={draft.team} onChange={(event) => update("team", event.target.value)} />
              </label>
            </div>
            <div className="pitch-section-label">Additional information</div>
            <div className="pitch-form-row pitch-stretch">
              <div className="pitch-upload-box">
                <div className="pitch-upload-title">Add a voice note</div>
                <div className="pitch-upload-desc">Describe what you already know</div>
                <input className="pitch-field" placeholder="Write additional text" value={draft.voiceNote} onChange={(event) => update("voiceNote", event.target.value)} />
              </div>
              <label className="pitch-upload-box">
                <div className="pitch-upload-title">Add client documents</div>
                <div className="pitch-upload-desc">PDF, DOCX, or TXT for Stage 1 · PNG, JPEG, or WebP logo</div>
                <input
                  type="file"
                  multiple
                  onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
                />
                {files.length > 0 ? <div className="pitch-upload-desc">{files.map((file) => file.name).join(", ")}</div> : null}
              </label>
            </div>
            <div className="pitch-actions-end">
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void handlePrepare()}>
                {busy ? "Preparing..." : "Prepare brief →"}
              </button>
            </div>
          </div>
          <aside className="pitch-side-col">
            <h3>What happens next</h3>
            <div className="pitch-next-step"><span className="active">1</span><div><strong>Company brief</strong><p>Facts with sources and gaps</p></div></div>
            <div className="pitch-next-step"><span>2</span><div><strong>Borek hypothesis</strong><p>Capabilities and opportunities</p></div></div>
            <div className="pitch-next-step"><span>3</span><div><strong>Meeting preparation</strong><p>Questions, agenda and pitch</p></div></div>
            <div className="pitch-side-note">
              <strong>Nothing is sent automatically.</strong>
              <p>Client-facing material still requires Managing Partner release.</p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

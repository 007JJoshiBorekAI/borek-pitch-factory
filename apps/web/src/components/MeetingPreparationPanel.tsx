"use client";



import Link from "next/link";

import { useRouter, useSearchParams } from "next/navigation";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";



import { LiveGenerationProgress } from "@/components/LiveGenerationProgress";

import { RecoveryBanner } from "@/components/RecoveryBanner";

import { SiteHeader } from "@/components/SiteHeader";

import { StageStepper } from "@/components/StageChrome";

import { useAuth } from "@/components/AuthProvider";

import { getOpportunity } from "@/lib/api";

import {

  discoveryQuestionsFromDraft,

  formatMeetingPrepUpdated,

  meetingPrepBannerSummary,

} from "@/lib/meetingPreparation";

import { buildJobProgressView } from "@/lib/jobProgress";

import { draftFromNotes, emptyPitchDraft, loadPitchDraft, type PitchDraft } from "@/lib/pitchDraft";

import { PresentationPipelineError } from "@/lib/presentationPipeline";

import {

  createStage2PrepareApi,

  pitchReviewResultHref,

  runStage2SlidePrepare,

  type Stage2PrepareProgress,

} from "@/lib/stage2PreparePipeline";

import {

  recoveryNoticeFromError,

  type RecoveryNotice,

} from "@/lib/recoveryUx";



type PreparePhase = "loading_context" | "preparing" | "brief" | "redirecting";



export function MeetingPreparationPanel() {

  const router = useRouter();

  const params = useSearchParams();

  const opportunityId = params.get("opportunityId")?.trim() || "";

  const { accessToken, session } = useAuth();

  const [draft, setDraft] = useState<PitchDraft | null>(null);

  const [phase, setPhase] = useState<PreparePhase>("loading_context");

  const [error, setError] = useState<string | null>(null);

  const [notice, setNotice] = useState<RecoveryNotice | null>(null);

  const [prepareProgress, setPrepareProgress] = useState<Stage2PrepareProgress>({

    frameworkJob: null,

    pipelineHandoff: false,

    plannedSlideCount: null,

    pipelineJob: null,

  });

  const prepareAttemptRef = useRef(0);
  const prepareStartedRef = useRef(false);



  useEffect(() => {

    let cancelled = false;

    async function load() {

      if (!accessToken || !opportunityId) {

        setPhase("brief");

        return;

      }

      try {

        const opportunity = await getOpportunity(accessToken, opportunityId);

        const stored =

          loadPitchDraft(opportunityId) ?? draftFromNotes(opportunity.additional_client_information?.notes);

        if (!cancelled) {

          setDraft(

            stored ??

              emptyPitchDraft({

                client: opportunity.client_name,

                pitchTitle: opportunity.opportunity_name,

                service: opportunity.department,

              }),

          );

        }

      } catch (loadError) {

        if (!cancelled) {

          setError(loadError instanceof Error ? loadError.message : "Meeting preparation could not be loaded.");

          setPhase("brief");

        }

      }

    }

    void load();

    return () => {

      cancelled = true;

    };

  }, [accessToken, opportunityId]);



  const runPrepare = useCallback(async () => {

    if (!accessToken || !opportunityId) {

      return;

    }

    const attempt = prepareAttemptRef.current + 1;

    prepareAttemptRef.current = attempt;

    setPhase("preparing");

    setNotice(null);

    setError(null);

    setPrepareProgress({

      frameworkJob: null,

      pipelineHandoff: false,

      plannedSlideCount: null,

      pipelineJob: null,

    });



    const api = createStage2PrepareApi(accessToken, opportunityId, setPrepareProgress);

    try {

      const outcome = await runStage2SlidePrepare(api);

      if (prepareAttemptRef.current !== attempt) {

        return;

      }

      if (outcome === "already_ready") {

        setPhase("brief");

        return;

      }

      setPhase("redirecting");

      router.replace(pitchReviewResultHref(opportunityId, outcome));

    } catch (prepareError) {

      if (prepareAttemptRef.current !== attempt) {

        return;

      }

      const context =

        prepareError instanceof PresentationPipelineError && prepareError.phase === "generation"

          ? "deck"

          : prepareError instanceof PresentationPipelineError && prepareError.phase === "planning"

            ? "plan"

            : "framework";

      setNotice(recoveryNoticeFromError(prepareError, context));

      setPhase("brief");

    }

  }, [accessToken, opportunityId, router]);



  useEffect(() => {

    if (
      !accessToken ||
      !opportunityId ||
      !draft ||
      phase !== "loading_context" ||
      prepareStartedRef.current
    ) {

      return;

    }

    prepareStartedRef.current = true;

    void runPrepare();

  }, [accessToken, opportunityId, draft, phase, runPrepare]);



  const frameworkProgressView = useMemo(

    () => buildJobProgressView({ snapshot: prepareProgress.frameworkJob }),

    [prepareProgress.frameworkJob],

  );

  const pipelineProgressView = useMemo(

    () =>

      buildJobProgressView({

        snapshot: prepareProgress.pipelineJob,

        handoff: prepareProgress.pipelineHandoff,

        plannedSlideCount: prepareProgress.plannedSlideCount,

      }),

    [

      prepareProgress.pipelineHandoff,

      prepareProgress.pipelineJob,

      prepareProgress.plannedSlideCount,

    ],

  );

  const liveProgressView =

    prepareProgress.pipelineJob || prepareProgress.pipelineHandoff

      ? pipelineProgressView

      : frameworkProgressView;



  const questions = useMemo(() => (draft ? discoveryQuestionsFromDraft(draft) : []), [draft]);

  const previewQuestions = questions.slice(0, 6);

  const updatedLabel = formatMeetingPrepUpdated(draft?.reviewedAt);

  const reviewHref = `/pitch-review?opportunityId=${encodeURIComponent(opportunityId)}`;



  const clientContext =

    draft?.summary.trim() ||

    draft?.businessNeed.trim() ||

    draft?.description.trim() ||

    "Review the captured meeting notes before you open the pitch.";

  const pressure = draft?.painPoints.trim() || "Cost, speed and consistent quality";

  const learn = draft?.requirements.trim() || "Current volumes, tooling and decision process";

  const hypothesis =

    draft?.proposedSolution.trim() ||

    draft?.borekServices.trim() ||

    "A dedicated team, supported by AI quality controls, may reduce operational friction without weakening governance.";

  const proof = draft?.scope.trim() || "Relevant Borek delivery experience in this domain";

  const capability = draft?.borekServices.trim() || draft?.service.trim() || "Borek capabilities matched to this opportunity";



  const preparing = phase === "preparing" || phase === "redirecting";

  const showBrief = phase === "brief" && draft && opportunityId;



  return (

    <div className="app-workspace">

      <SiteHeader signedInEmail={session?.user.email} progressVariant="review" />

      <main className="app-shell app-workspace-body">

        {!opportunityId ? (

          <section className="recent-empty">

            <h2>Complete create pitch first</h2>

            <Link href="/clients" className="btn btn-primary">Go to clients</Link>

          </section>

        ) : null}

        {error ? <div className="alert alert-error" role="alert">{error}</div> : null}

        {notice ? (

          <RecoveryBanner

            notice={notice}

            busy={preparing}

            onAction={() => {

              if (notice.action?.kind === "GENERATE" || notice.action?.kind === "RETRY") {

                prepareStartedRef.current = false;

                setPhase("loading_context");

              }

            }}

          />

        ) : null}

        {preparing ? (

          <>

            <p className="pitch-breadcrumb">

              <Link href="/clients">Clients</Link> / <span>{draft?.client ?? "Client"}</span> /{" "}

              <span>Prepare</span>

            </p>

            <StageStepper activeIndex={4} />

            <section className="upload-panel pipeline-panel-loading" data-testid="stage2-prepare-loading">

              <header className="upload-panel-header">

                <div>

                  <h2>Preparing your pitch slides</h2>

                  <p>

                    Building the presentation from your Stage 2 context. You do not need to review the

                    framework — this runs automatically.

                  </p>

                </div>

              </header>

              {liveProgressView ? (

                <LiveGenerationProgress view={liveProgressView} />

              ) : (

                <p className="upload-hint">Starting…</p>

              )}

            </section>

          </>

        ) : null}

        {showBrief ? (

          <>

            <p className="pitch-breadcrumb">

              <Link href="/clients">Clients</Link> / <span>{draft.client}</span> /{" "}

              <span>Meeting preparation</span>

            </p>

            <div className="pitch-greet-row">

              <div>

                <h2 className="pitch-greet pitch-meeting-prep-title">Ready for the conversation</h2>

                <p className="pitch-subtle pitch-lead">Everything you need five minutes before the meeting.</p>

              </div>

              <Link className="btn btn-primary" href={reviewHref}>

                Review pitch →

              </Link>

            </div>

            <StageStepper activeIndex={4} />

            <div className="pitch-meeting-prep-banner" data-testid="meeting-prep-banner">

              <strong>

                <span className="pitch-meeting-prep-sq" aria-hidden="true" />

                Meeting brief ready

              </strong>

              <span className="pitch-meeting-prep-banner-mid">{meetingPrepBannerSummary(questions.length)}</span>

              {updatedLabel ? (

                <span className="pitch-meeting-prep-banner-time">Last updated {updatedLabel}</span>

              ) : null}

            </div>

            <div className="pitch-meeting-prep-cols">

              <div>

                <div className="pitch-form-eyebrow">Client in 30 seconds</div>

                <h3 className="pitch-mid-title">What matters now</h3>

                <p>{clientContext}</p>

                <div className="pitch-meeting-prep-kv">

                  <div className="pitch-meeting-prep-kv-row">

                    <span className="pitch-meeting-prep-kv-label">Likely pressure</span>

                    <span className="pitch-meeting-prep-kv-value">{pressure}</span>

                  </div>

                  <div className="pitch-meeting-prep-kv-row">

                    <span className="pitch-meeting-prep-kv-label">What we need to learn</span>

                    <span className="pitch-meeting-prep-kv-value">{learn}</span>

                  </div>

                </div>

                <div className="pitch-form-eyebrow pitch-meeting-prep-spaced">Why Borek</div>

                <h3 className="pitch-mid-title">Opening hypothesis</h3>

                <p>{hypothesis}</p>

                <div className="pitch-meeting-prep-kv">

                  <div className="pitch-meeting-prep-kv-row">

                    <span className="pitch-meeting-prep-kv-label">Relevant proof</span>

                    <span className="pitch-meeting-prep-kv-value">{proof}</span>

                  </div>

                  <div className="pitch-meeting-prep-kv-row">

                    <span className="pitch-meeting-prep-kv-label">Capability</span>

                    <span className="pitch-meeting-prep-kv-value">{capability}</span>

                  </div>

                </div>

              </div>

              <div>

                <div className="pitch-form-eyebrow">Discovery questions</div>

                <h3 className="pitch-mid-title">Ask these first</h3>

                <ol className="pitch-meeting-prep-questions">

                  {previewQuestions.map((question, index) => (

                    <li key={`${index}-${question}`}>

                      <span className="pitch-meeting-prep-qnum">{String(index + 1).padStart(2, "0")}</span>

                      <span>{question}</span>

                    </li>

                  ))}

                </ol>

                {questions.length > previewQuestions.length ? (

                  <p className="pitch-subtle">

                    {questions.length - previewQuestions.length} more in your meeting notes

                  </p>

                ) : null}

                <div className="pitch-meeting-prep-agenda">

                  <div className="pitch-form-eyebrow">Agenda · 30 min</div>

                  <p className="pitch-meeting-prep-agenda-line">

                    Context 5 min · Discovery 15 min · Borek 8 min · Next step 2 min

                  </p>

                </div>

                <Link className="btn btn-primary pitch-block-btn" href={reviewHref}>

                  Review pitch →

                </Link>

              </div>

            </div>

          </>

        ) : null}

      </main>

    </div>

  );

}



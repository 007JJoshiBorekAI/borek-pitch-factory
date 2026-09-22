"""Render Pitch Factory architecture + CI/CD + API I/O flow diagram (PNG)."""

from __future__ import annotations

from pathlib import Path

import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "architecture" / "pitch_factory_pipeline_flow.png"

# Larger type defaults for readability in PNG exports
BODY_FS = 10.5
TITLE_FS = 12.5
LANE_FS = 14
HEADER_FS = 18
SUBHEADER_FS = 11.5


def box(
    ax,
    x,
    y,
    w,
    h,
    title,
    body,
    fc,
    ec="#1a1a2e",
    body_fs=BODY_FS,
    title_fs=TITLE_FS,
    body_top=0.75,
):
    patch = FancyBboxPatch(
        (x, y),
        w,
        h,
        boxstyle="round,pad=0.02,rounding_size=0.08",
        linewidth=1.4,
        edgecolor=ec,
        facecolor=fc,
        transform=ax.transData,
        zorder=2,
    )
    ax.add_patch(patch)
    ax.text(
        x + w / 2,
        y + h - 0.42,
        title,
        ha="center",
        va="top",
        fontsize=title_fs,
        fontweight="bold",
        color="#0f172a",
        zorder=3,
    )
    ax.text(
        x + 0.14,
        y + h - body_top,
        body,
        ha="left",
        va="top",
        fontsize=body_fs,
        color="#1e293b",
        linespacing=1.4,
        family="monospace",
        zorder=3,
    )


def lane_label(ax, y, text, color):
    ax.text(
        0.12,
        y,
        text,
        ha="left",
        va="center",
        fontsize=LANE_FS,
        fontweight="bold",
        color=color,
        rotation=90,
    )


def arrow(ax, x1, y1, x2, y2, color="#64748b"):
    ax.add_patch(
        FancyArrowPatch(
            (x1, y1),
            (x2, y2),
            arrowstyle="-|>",
            mutation_scale=14,
            linewidth=1.2,
            color=color,
            zorder=1,
        )
    )


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)

    fig, ax = plt.subplots(figsize=(28, 44))
    ax.set_xlim(0, 26)
    ax.set_ylim(0, 48)
    ax.axis("off")
    fig.patch.set_facecolor("#f8fafc")

    ax.text(
        13,
        47.1,
        "Borek Pitch Factory — Pages, JSON contracts & worker pipeline",
        ha="center",
        fontsize=HEADER_FS,
        fontweight="bold",
        color="#0f172a",
    )
    ax.text(
        13,
        46.35,
        "packages/contracts · FastAPI request/response bodies · JobStage state machine",
        ha="center",
        fontsize=SUBHEADER_FS,
        color="#475569",
    )

    # --- CI/CD ---
    lane_label(ax, 44.6, "CI / CD", "#7c3aed")
    box(
        ax,
        1.2,
        43.2,
        5.2,
        2.6,
        "1 · Verify",
        "IN: git push / pull request\n"
        "OUT: pytest green\n"
        "  marker: not live_claude\n"
        "JSON Schema validate fixtures",
        "#ede9fe",
        ec="#7c3aed",
    )
    box(
        ax,
        6.8,
        43.2,
        5.4,
        2.6,
        "2 · Build images",
        "IN: docker/api, worker, web,\n"
        "  renderer Dockerfiles\n"
        "OUT: images for\n"
        "  web · api · worker · renderer · redis",
        "#ede9fe",
        ec="#7c3aed",
    )
    box(
        ax,
        12.6,
        43.2,
        5.4,
        2.6,
        "3 · Integration gate",
        "IN: compose stack + contract fixtures\n"
        "OUT: full user journey E2E\n"
        "  login → deck download\n"
        "  failure recovery paths",
        "#ede9fe",
        ec="#7c3aed",
    )
    box(
        ax,
        18.4,
        43.2,
        6.4,
        2.6,
        "4 · Release",
        "IN: .env secrets\n"
        "OUT: NEXT_PUBLIC_API_URL\n"
        "  web :3000  api :8000\n"
        "  REDIS_URL · RENDERER_URL · Supabase",
        "#ede9fe",
        ec="#7c3aed",
    )
    for x in (6.4, 12.2, 18.0):
        arrow(ax, x, 44.5, x + 0.5, 44.5, "#7c3aed")

    # --- Runtime ---
    lane_label(ax, 41.0, "RUNTIME", "#0369a1")
    services = [
        (
            "Web (Next.js)",
            "Bearer access_token\npoll GET /jobs/{job_id}\n  .current_stage",
        ),
        (
            "API (FastAPI)",
            "202 + JobEnqueueResponse\npersist rows Supabase\nenqueue Celery task",
        ),
        (
            "Worker",
            "advance JobStage\nemit contract JSON\nfile ARTIFACT_ROOT",
        ),
        (
            "Renderer",
            "IN: slide_spec + template\nOUT: pptx, pdf, png",
        ),
        (
            "Data plane",
            "opportunities, jobs,\nframework_versions,\npresentation_versions",
        ),
    ]
    for i, (t, b) in enumerate(services):
        box(ax, 1.2 + i * 4.85, 38.0, 4.55, 2.9, t, b, "#e0f2fe", ec="#0369a1")
    for x in (5.75, 10.6, 15.45, 20.3):
        arrow(ax, x, 39.45, x + 0.55, 39.45)

    # --- Journey eligibility JSON ---
    box(
        ax,
        1.2,
        35.0,
        23.6,
        2.4,
        "journey_stage_eligibility.schema.json",
        "GET /opportunities/{id}/journey-stage-eligibility?journey_stage=\n"
        "OUT JourneyStageEligibility: schema_version, opportunity_id, requested_journey_stage,\n"
        "  startable, prerequisite_stage, prior_stage_presentation_version_id,\n"
        "  reason ∈ {NO_COMPLETED_PREREQUISITE, PREREQUISITE_INCOMPLETE, …},\n"
        "  next_action ∈ {complete_first_contact, complete_deepening, …}, stages[3]",
        "#fef3c7",
        ec="#b45309",
        body_top=0.95,
    )

    # --- UI pages with JSON ---
    lane_label(ax, 31.8, "UI PAGES", "#15803d")
    pages = [
        (
            "/login · /register",
            "journey: —",
            "IN: Supabase session\nOUT: JWT access_token\n→ Authorization header",
            "#dcfce7",
            3.2,
        ),
        (
            "/  Home",
            "journey: all",
            "GET /opportunities/recent-work\nOUT RecentWorkSnapshot[]:\n"
            "  opportunity.{id, client_name, opportunity_name}\n"
            "  transcript_count, framework_status, has_plan\n"
            "  presentation_id, deck.pptx_download_url\n"
            "  job.{job_type, status, current_stage}",
            "#dcfce7",
            4.4,
        ),
        (
            "/upload  (step 1 Intake)",
            "journey: first_contact",
            "POST /opportunities\nIN OpportunityCreateRequest:\n"
            "  client_name, opportunity_name, department,\n"
            "  language, pii_redaction_enabled,\n"
            "  additional_client_information.{contacts,\n"
            "    location_requirements, constraints, priorities, notes},\n"
            "  followup_statics.{project_name, client_short,\n"
            "    salutation_style, standard_recipients[], sender_profile}\n"
            "OUT OpportunityResponse + id (UUID)\n"
            "PUT …/client-logo → ClientLogoMetadata",
            "#bbf7d0",
            6.8,
        ),
        (
            "/framework-review  (step 2)",
            "journey: deepening+",
            "POST …/transcripts (multipart)\n"
            "OUT TranscriptResponse:\n"
            "  id, file_name, processing_status\n"
            "POST …/framework/generate → job_id\n"
            "GET …/framework/review → framework preview\n"
            "PATCH …/framework\nIN UpdateFrameworkRequest:\n"
            "  framework_json → FrameworkObject\n"
            "POST …/confirm\nIN ConfirmFrameworkRequest:\n"
            "  framework_version_id",
            "#86efac",
            6.8,
        ),
        (
            "/plan-preview  (step 3)",
            "journey: all",
            "GET …/presentation-plan\nOUT PresentationPlanResponse:\n"
            "  id, framework_version_id,\n"
            "  plan_json → PresentationPlan\n"
            "POST …/presentation-plan/generate\nIN GeneratePresentationPlanRequest:\n"
            "  framework_version_id?, auto_continue?,\n"
            "  journey_stage?: first_contact|deepening|concretisation\n"
            "OUT: job_id, presentation_plan_id",
            "#4ade80",
            6.4,
        ),
        (
            "/deck-center  (step 4)",
            "journey: all",
            "POST …/presentation/generate\nIN GeneratePresentationRequest:\n"
            "  presentation_plan_id?, journey_stage?, name?\n"
            "GET /presentations/{id}/deck\nOUT DeckCenterResponse:\n"
            "  slides[].{slide_id, layout_id, preview_url},\n"
            "  pptx_download_url, pdf_download_url\n"
            "GET …/download/pptx | …/pdf",
            "#22c55e",
            6.4,
        ),
        (
            "/followup-review",
            "journey: optional",
            "Reads opportunity.followup_statics\n"
            "Worker produces followup_extraction.schema.json:\n"
            "  meeting_topic, meeting_date, participants[],\n"
            "  key_points[], decisions[], action_items[],\n"
            "  open_questions[], next_meeting, review_flags[]\n"
            "Human confirms before send",
            "#dcfce7",
            5.2,
        ),
        (
            "/archive",
            "journey: all",
            "GET /archive/artifacts\nOUT ArchiveArtifactResponse[]:\n"
            "  artifact_kind, content_type, file_name,\n"
            "  sha256, journey_stage,\n"
            "  prior_stage_presentation_version_id,\n"
            "  download_url",
            "#dcfce7",
            4.8,
        ),
    ]
    row_heights = (7.2, 6.2)
    row_tops = (33.4, 33.4 - row_heights[0] - 0.7)
    cols = 4
    for i, (title, journey, api, fc, h) in enumerate(pages):
        col = i % cols
        row = i // cols
        x = 1.2 + col * 5.95
        row_h = row_heights[row]
        y = row_tops[row] + (row_h - h)
        box(ax, x, y, 5.75, h, title, f"{journey}\n\n{api}", fc, ec="#15803d", body_top=1.05)

    # --- Job JSON ---
    box(
        ax,
        1.2,
        17.0,
        23.6,
        2.6,
        "Async jobs (all POST …/generate)",
        "OUT 202 JobEnqueueResponse: { job_id, status, is_existing_job }\n"
        "GET /jobs/{job_id} → JobResponse:\n"
        "  job_type, status, current_stage (JobStage enum),\n"
        "  error?: { code, message, stage, retryable }, result: {}, metrics: {}\n"
        "GET /opportunities/{id}/jobs/active → { job_id, job_type, current_stage, auto_continue }\n"
        "POST /jobs/{job_id}/retry → JobEnqueueResponse",
        "#f1f5f9",
        ec="#475569",
        body_top=0.95,
    )

    # --- Worker pipelines ---
    lane_label(ax, 16.8, "WORKER", "#be123c")

    box(
        ax,
        1.2,
        11.0,
        7.4,
        7.2,
        "first_contact pipeline",
        "IN: OpportunityCreateRequest fields +\n"
        "  client documents (text extract)\n"
        "STEPS → JSON artifacts:\n"
        "  stage1_research (target):\n"
        "    company_description, headcount, hq,\n"
        "    decision_makers[], revenue\n"
        "  stage1_outputs (target):\n"
        "    discovery_questions[], use_cases[],\n"
        "    meeting_agenda\n"
        "  PresentationPlan (3 slides):\n"
        "    slides[].{order, purpose,\n"
        "      layoutId, frameworkReferences[]}\n"
        "  GammaContentPayload:\n"
        "    stage=first_contact, slots[],\n"
        "    grounded_facts[]\n"
        "  followup_extraction (optional email)",
        "#ffe4e6",
        ec="#be123c",
        body_top=1.05,
    )

    box(
        ax,
        8.9,
        11.0,
        7.4,
        7.2,
        "deepening pipeline",
        "IN: transcript file +\n"
        "  meeting feedback + docs\n"
        "STEPS:\n"
        "  TRANSCRIPT_PROCESSING\n"
        "  → transcript_summary (target):\n"
        "      decisions[], action_items[],\n"
        "      open_questions[], summary_truncated\n"
        "  → knowledge_model.schema.json:\n"
        "      facts[], stated_requirements[],\n"
        "      constraints[], named_systems[], unknowns[]\n"
        "  → framework_object.schema.json:\n"
        "      chapters[14], status, kpis, …\n"
        "  → stage2_outputs (target):\n"
        "      call_summary, mom\n"
        "  → PresentationPlan + slide_spec/*\n"
        "  → followup_extraction.schema.json",
        "#fecdd3",
        ec="#be123c",
        body_top=1.05,
    )

    box(
        ax,
        16.6,
        11.0,
        8.2,
        7.2,
        "concretisation pipeline",
        "IN: prior_stage_presentation_version_id\n"
        "  (from eligibility JSON)\n"
        "JobStage sequence:\n"
        "  QUEUED → TRANSCRIPT_PROCESSING\n"
        "  → KNOWLEDGE_EXTRACTING\n"
        "  → FRAMEWORK_SYNTHESIZING\n"
        "  → FRAMEWORK_VALIDATING\n"
        "  → PRESENTATION_PLANNING\n"
        "  → SLIDE_GENERATING\n"
        "  → SLIDE_VALIDATING\n"
        "  → PPTX_RENDERING\n"
        "  → GAMMA_RENDERING\n"
        "  → ARTIFACT_FILING\n"
        "  → PREVIEW_RENDERING → COMPLETED\n"
        "OUT: SlideResponse.slide_spec,\n"
        "  DeckCenterResponse, filed artifacts",
        "#fda4af",
        ec="#be123c",
        body_fs=9,
        body_top=1.05,
    )

    box(
        ax,
        1.2,
        7.0,
        11.5,
        3.5,
        "POST /knowledge/retrieve",
        "IN KnowledgeRetrievalRequest:\n"
        "  text, kind?: service|pricing|staffing|reference,\n"
        "  query_key?, service_key?\n"
        "OUT KnowledgeRetrievalResponse:\n"
        "  status: answered|unknown, statement,\n"
        "  payload{}, sources[].{fact_id, corpus_id,\n"
        "    classification, provenance_marker}, reason",
        "#fff1f2",
        ec="#be123c",
        body_top=1.0,
    )

    box(
        ax,
        13.2,
        7.0,
        11.6,
        3.5,
        "Core contract files (frozen JSON)",
        "framework_object.schema.json — status, chapters[],\n"
        "  quality_scores, open_items, version\n"
        "presentation_plan.schema.json — title, slides[]\n"
        "slide_spec/<group>/<layout>.schema.json\n"
        "gamma_payload.schema.json — template_id, stage, slots[]\n"
        "followup_extraction.schema.json\n"
        "journey_stage_eligibility.schema.json\n"
        "Target (pre-meeting / post-call packs):\n"
        "  stage1_research, stage1_outputs,\n"
        "  stage2_outputs, transcript_summary",
        "#fff1f2",
        ec="#be123c",
        body_fs=9,
        body_top=1.0,
    )

    lane_label(ax, 4.5, "EXTERNAL", "#a16207")
    box(
        ax,
        1.2,
        1.0,
        7.5,
        3.2,
        "LLM providers",
        "IN: prompt + contract schema\n"
        "OUT: JSON matching\n"
        "  FrameworkObject | PresentationPlan |\n"
        "  slide_spec | KnowledgeModel |\n"
        "  FollowupExtraction",
        "#fef9c3",
        ec="#a16207",
    )
    box(
        ax,
        9.2,
        1.0,
        7.5,
        3.2,
        "Gamma",
        "IN gamma_payload.schema.json\n"
        "  { template_id, stage, slots[],\n"
        "    grounded_facts[], client_logo_ref? }\n"
        "OUT: provider deck ref\n"
        "fallback → internal PPTX_RENDERING",
        "#fef9c3",
        ec="#a16207",
    )
    box(
        ax,
        17.2,
        1.0,
        7.6,
        3.2,
        "Supabase",
        "IN: JWT (sub, email)\n"
        "OUT: relational rows for\n"
        "  opportunities, transcripts,\n"
        "  framework_versions.plan_json,\n"
        "  jobs.current_stage, audit_log",
        "#fef9c3",
        ec="#a16207",
    )

    ax.text(
        13,
        0.35,
        "Target schemas (stage1_*, stage2_*, transcript_summary) = planned contract files; all other JSON names are in packages/contracts today.",
        ha="center",
        fontsize=SUBHEADER_FS,
        color="#64748b",
        style="italic",
    )

    plt.tight_layout(pad=0.6)
    fig.savefig(OUT, dpi=160, bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()

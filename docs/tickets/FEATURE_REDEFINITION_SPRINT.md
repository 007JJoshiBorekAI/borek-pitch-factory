# Feature redefinition sprint

**Decision date:** 21 September 2026  
**Source:** Head of AI direction + `Pitch Factory input_output.docx`  
**Owners:** Mayank Somwani (pipeline), Blenard Tahiraj (UI), Jaya Joshi (QA)

## Journey mapping (docx → app stages)

| Docx stage | App journey stage | When |
| --- | --- | --- |
| Stage 1 — Pre-meeting | **First contact** | Before the first client meeting |
| Stage 2 — After 1st meeting | **Deepening** | After the first meeting |
| *(not in docx)* | **Concretisation** | Priced proposal — existing journey; email option added |

## Stage 1 — Pre-meeting (First contact)

### Sales team provides

| Input | Ticket |
| --- | --- |
| Client name | Existing opportunity field |
| Client web page | MS-33 |
| POC name, POC position | MS-33 |
| Sales topic description (+ optional voice recording) | MS-33 |
| About company (free text) | MS-33 / BT-34 |
| Client documents — **not transcripts** | MS-34 / BT-35 |

### Expected output

| Output | Ticket |
| --- | --- |
| Brief company description, headcount, HQ, decision makers, revenue | BT-34 / BT-36 |
| Hypothesis for Borek support | BT-36 |
| Relevance to product offering | BT-36 |
| 10–15 probing / discovery questions | BT-36 |
| Use case relevance (from past Borek use cases) | BT-36 |
| First-meeting PPT: AI-tech slides, hypothesis slide, use-case slide | BT-36 / MS-35 |
| 1st-meeting agenda | BT-36 / MS-35 |
| Draft email *(optional send on all stages)* | MS-35 / BT-36 |

## Stage 2 — After 1st meeting (Deepening)

### Sales team provides

| Input | Ticket |
| --- | --- |
| Jamie / meeting transcript | Existing transcript upload — MS-35 |
| Meeting feedback (rep learnings) | MS-35 |
| Additional documents (optional) | MS-35 |

### Expected output

| Output | Ticket |
| --- | --- |
| Call summary | BT-36 |
| MOM (minutes of meeting) | BT-36 |
| Draft email after the call | BT-36 / MS-35 |
| Adjusted PPT from meeting discussion | BT-36 / MS-35 |

## Concretisation

Existing priced-proposal deck path unchanged. **Draft email** option added (MS-35 / BT-36).

## Global rule — transcript → summary before LLM

Whenever the pipeline consumes **meeting transcript** input (Deepening, Concretisation,
follow-up extraction, or any future transcript-backed stage):

1. **Store** the raw transcript (speaker turns) unchanged — for audit, download, and
   MS-32 human review against source.
2. **Summarize** in a dedicated job step (`TRANSCRIPT_SUMMARIZING`) before any
   downstream LLM call.
3. **Inject** only the structured summary into prompts as
   `TRANSCRIPT_SUMMARY_BEGIN … TRANSCRIPT_SUMMARY_END` — not raw dialogue or full
   speaker turns.

Summary must preserve stated facts: decisions, commitments, owners, dates (or TBD),
client terminology, and open questions. Same never-invent rules as JJ-32.

Voice recordings transcribed on intake (MS-33) follow the same rule when their text
feeds a generation prompt.

**Owner:** BT-36 (Mayank). **Verified by:** QA-03 scenario 13.

## Ticket map

| ID | Title | Owner |
| --- | --- | --- |
| MS-33 | Stage 1 sales intake (docx fields + About Company + voice) | Blenard |
| BT-34 | Intake context + company research in main prompts | Mayank |
| MS-34 | Client document upload for First contact | Blenard |
| BT-35 | First contact client document pipeline | Mayank |
| MS-35 | Stage output review UI + email on all 3 stages | Blenard |
| BT-36 | Stage 1 & 2 output pipelines (research, PPT, agenda, MOM, email) | Mayank |
| QA-01 | Stage 1 intake + research outputs | Jaya |
| QA-02 | Stage 1 documents + first-meeting PPT/agenda | Jaya |
| QA-03 | Stage 2 outputs + email all stages + Concretisation | Jaya |
| TSK-008 | Employee login, role model and activity log (D3) | Jaya |
| TSK-009 | Jamie AI connector (D8) | Mayank |
| TSK-010 | Translate CI sheet into design tokens | Blenard |
| TSK-011 | Control Tower routing, versioning and logging (D5) | Jaya |
| TSK-012 | Content agent for the three journey stages (D6) | Blenard |
| TSK-013 | Follow-up e-mail in three lengths (D9) | Mayank |
| TSK-014 | Design agent on the design tokens (D7) | Blenard |
| TSK-015 | Automated minutes of meeting (D10) | Mayank |
| TSK-016 | Approval workflow and automatic filing (D11) | Jaya |

Assignment PDF: `Pitch_Factory_Feature_Redefinition_Mayank_Blenard_QA.pdf`

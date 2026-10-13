# Discovery-first assignment — 2 October 2026

**Scope:** Pre-meeting + post-meeting only. Concretisation is out of the owner path.  
**Rule:** Jaya owns Gamma + both decks. Mayank owns core workflow. Blenard owns remaining UI / email / approvals.  
**PDF:** `docs/tickets/Pitch_Factory_Discovery_First_Jaya_Mayank_Blenard.pdf`

## By person

| Owner | Tickets | Vertical |
| --- | --- | --- |
| Jaya Joshi | JJ-33 – JJ-37 | Gamma, master template, PPT #1 (max 8), PPT #2 (Ai Tech), editable PPTX/PDF |
| Mayank Somwani | BT-40 – BT-48 | Intake, Discovery Paper, gates, transcript AI, use-case attach, PPT #2 context, status, versions |
| Blenard Tahiraj | MS-40 – MS-47 | Figma/brand UI, forms, discovery editor, post-meeting UX, approvals, Elena email |
| Shared | QA-26 | End-to-end sample client |

## Ticket list

| ID | Title | Owner | Reqs | Done when |
| --- | --- | --- | --- | --- |
| JJ-33 | Lock Master PPT as Gamma template | Jaya | 6, 14 | PPT #1 and PPT #2 render from the locked master; branding keys stay locked |
| JJ-34 | PPT #1 from approved Discovery (≤8 slides) | Jaya | 7, 17 | First-contact profile ≤8 cards; sourced from approved Discovery |
| JJ-35 | PPT #2 on Ai Tech master + use cases | Jaya | 13–16 | New versioned deck; does not overwrite PPT #1 |
| JJ-36 | Editable PPTX (+ PDF) outputs | Jaya | 17 | PPTX is first-class; previews are not the only artifact |
| JJ-37 | Preview raster, engine-neutral UI | Jaya | (MS-42 support) | Progressive previews; no user-facing “Gamma” |
| BT-40 | Client/opportunity intake persistence | Mayank | 3 | Fields stored and reused on the opportunity |
| BT-41 | Structured Discovery Paper generation | Mayank | 4 | 7 Figma sections; not unstructured Q-only |
| BT-42 | Discovery edit / approve / versions | Mayank | 5, 24 | Approved version is PPT #1 source |
| BT-43 | Gate: Discovery approved before PPT #1 | Mayank | 7, 22 | PPT #1 job refused until approve |
| BT-44 | Transcript + notes + AI extract | Mayank | 8–10 | Separate stores; extraction JSON for PPT #2 |
| BT-45 | Attach existing use cases | Mayank | 11, 16 | Reuse bodies; no regenerate |
| BT-46 | Unified PPT #2 context | Mayank | 12 | Tagged sources; approved info wins |
| BT-47 | Status tracking + document lineage | Mayank | 18, 23, 24 | Eight statuses; PPT1 ≠ PPT2 versions |
| BT-48 | Finalize from latest approved; drop concretisation | Mayank | 18 | Stale drafts cannot be final |
| MS-40 | Figma + brand book on platform UI | Blenard | 1–2 | Creating-your-pitch matches Figma 259-2 |
| MS-41 | Client information form | Blenard | 3 | Bound to BT-40 |
| MS-42 | Discovery UI: generate, edit, approve, PDF | Blenard | 4–5 | PDF disabled until all pages ready |
| MS-43 | Presentation tab, versioned decks | Blenard | 7, 13, 17 | PPT #1 and PPT #2 never mixed |
| MS-44 | Transcript upload + personal notes | Blenard | 8–9 | Bound to BT-44 |
| MS-45 | Use-case picker | Blenard | 11 | Bound to BT-45 |
| MS-46 | Owner checkpoints + stepper | Blenard | 22–23 | Eight statuses visible |
| MS-47 | Elena email: edit + attachments | Blenard | 19–21 | Draft/export only; final files listed |
| QA-26 | E2E sample client | Shared | 26 | Full path consistent; PPT #1 preserved |

Requirement 25 is unused.

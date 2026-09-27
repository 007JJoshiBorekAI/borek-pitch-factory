# TSK-008 – TSK-016 board assignment

**Source:** Control Tower / implementation board (TSK-008–TSK-016)  
**Added:** 22 September 2026  
**Rule:** assignees follow the board. Feature-redefinition **MS-*** tickets are owned by **Blenard**; **BT-*** tickets are owned by **Mayank**.

## By person

| Owner | Tickets | Vertical |
| --- | --- | --- |
| Jaya Joshi | TSK-008, TSK-011, TSK-016 | Login / SSO, Control Tower, approval + filing |
| Mayank Somwani | TSK-009, TSK-013, TSK-015 (+ BT-34–36) | Jamie connector, follow-up email, automated MOM, pipeline |
| Blenard Tahiraj | TSK-010, TSK-012, TSK-014 (+ MS-33–35) | CI design tokens, content agent, design agent, UI |

## Ticket list

| ID | Title | Type | Owner | Priority | Done when |
| --- | --- | --- | --- | --- | --- |
| TSK-008 | Build employee login, role model and activity log (D3) | Implementation | Jaya | Critical | Sign-in via Microsoft 365 SSO; every generation, edit and release is logged with user, time and document ID. |
| TSK-009 | Build Jamie AI connector (D8) | Implementation | Mayank | Critical | A finished meeting is picked up automatically; transcript, participants and actions are available within ten minutes. |
| TSK-010 | Translate the CI sheet into design tokens | Design | Blenard | High | CI sheet from Euron is translated into the design tokens used by the design agent. |
| TSK-011 | Build Control Tower routing, versioning and logging (D5) | Implementation | Jaya | Critical | Journey stage and output type are selectable; the request is routed, versioned and logged end-to-end. |
| TSK-012 | Build content agent for the three journey stages (D6) | Implementation | Blenard | Critical | For each stage a factually complete draft is produced from a test transcript without manual editing. |
| TSK-013 | Build follow-up e-mail in three lengths (D9) | Implementation | Mayank | Critical | For one test meeting: a short, a medium and an extensive draft, with the option to attach a generated deck. |
| TSK-014 | Build design agent on the design tokens (D7) | Implementation | Blenard | Critical | Output carries the CI and is judged sendable without rework against the reference deck. |
| TSK-015 | Build automated minutes of meeting (D10) | Implementation | Mayank | High | Minutes with participants, decisions, actions, owners and dates are generated and filed automatically. |
| TSK-016 | Build approval workflow and automatic filing (D11) | Implementation | Jaya | Critical | No document reaches ready-to-send without a Managing Partner release; released documents are filed automatically. |

Specs: see `borek-ai-suite/docs/tickets/TSK008_` … `TSK016_` (same assignment).

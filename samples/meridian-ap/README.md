# Meridian AP demo pack (fictional)

All names, numbers, and companies are **made up** for local testing only.

## Stage 1 — Start a new pitch (form)

| Field | Sample value |
|-------|----------------|
| Pitch Name / Title | Invoice 3-way match pilot |
| Client | Meridian Industrial Supply GmbH |
| Service / Solution | Finance automation / AI-assisted AP |
| Business Need / Opportunity | Reduce manual invoice matching before Q1 2027 close |
| Pitch Description | Pilot for automated PO–GR–invoice matching in shared AP mailbox; EU-only processing. |
| Pitch Owner | Lena Hoffmann |
| Team Members | Jonas Richter, AI delivery |
| Voice note (optional) | Referral from existing BOREK logistics client. Sandra wants 85% auto-match on clean cases; works council not involved yet. |

**Upload for Stage 1:** `Meridian_Client_Brief.pdf` or `Meridian_Client_Brief.txt` (same content). Optional: client logo PNG if you have one.

## First meeting — transcript

Upload: `01_discovery_call_transcript.txt`

## Stage 2 — after the workshop

1. Upload: `02_requirements_workshop_transcript.txt`
2. Meeting feedback (paste): text in `meeting_feedback_snippet.txt`

## Files

| File | Use |
|------|-----|
| `Meridian_Client_Brief.pdf` / `.txt` | Client document at pitch creation |
| `01_discovery_call_transcript.txt` | First meeting transcript |
| `02_requirements_workshop_transcript.txt` | Deepening / workshop transcript |
| `meeting_feedback_snippet.txt` | Works council / internal notes field |

Regenerate PDF after editing the brief:

```bash
python samples/meridian-ap/generate_client_brief_pdf.py
```

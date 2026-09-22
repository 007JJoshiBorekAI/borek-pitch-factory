# BT-35 to MS-34 handoff

2026-09-22 · branch `bt/bt35-first-contact-documents`

**READY:** client document upload/list/delete, text extraction, First contact research gating.  
**NOT READY:** First-meeting PPT, agenda, discovery questions, email (BT-36 / MS-35).

## Upload endpoint

| Method | Path | Success |
| --- | --- | --- |
| POST | `/opportunities/{opportunity_id}/client-documents` | 201 |
| GET | `/opportunities/{opportunity_id}/client-documents` | 200 |
| GET | `/opportunities/{opportunity_id}/client-documents/{document_id}` | 200 |
| DELETE | `/opportunities/{opportunity_id}/client-documents/{document_id}` | 204 |

### Request

Multipart form field: **`file`**

Supported formats:

| Extension | MIME types accepted |
| --- | --- |
| `.txt` | `text/plain` |
| `.docx` | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| `.pdf` | `application/pdf`, `application/octet-stream` |

Maximum size: **10 MB** (`10485760` bytes).

Authentication: bearer token (same as other opportunity routes). Only the opportunity owner may upload, list, read, or delete.

### Response (201)

```json
{
  "document": {
    "id": "uuid",
    "opportunity_id": "uuid",
    "file_name": "brief.txt",
    "mime_type": "text/plain",
    "document_key": "D1",
    "processing_status": "processed",
    "section_count": 2,
    "created_at": "2026-09-22T12:00:00Z"
  },
  "processing_status": "processed"
}
```

`storage_path` is never returned. Use `document_key` (`D1`, `D2`, …) for provenance display.

Processing states today:

| Status | Meaning |
| --- | --- |
| `processed` | Text extracted and available to First contact research |
| `failed` | Reserved for future async processing (not emitted on successful upload) |

## First contact vs Deepening UI

| Journey stage | Upload panel | Required before research/generation |
| --- | --- | --- |
| **First contact** | Client documents (this endpoint) | ≥1 processed client document |
| **Deepening** | Meeting transcripts (`POST …/transcripts`) | ≥1 transcript for framework generation |

Hide `TranscriptUploadPanel` on First contact. Hide client-document panel on Deepening primary flow (optional supplementary docs are MS-35).

## Classified errors

| Code | HTTP | UI guidance |
| --- | --- | --- |
| `INVALID_CLIENT_DOCUMENT_FORMAT` | 400 | Show supported formats (.pdf, .docx, .txt) |
| `INVALID_CLIENT_DOCUMENT_CONTENT` | 400 | Empty or unreadable file |
| `CLIENT_DOCUMENT_TOO_LARGE` | 400 | File exceeds 10 MB |
| `CLIENT_DOCUMENT_REQUIRED` | 400 | Block First contact research until ≥1 document uploaded |
| `TRANSCRIPT_NOT_ALLOWED_FOR_FIRST_CONTACT` | 400 | Explain transcripts belong to Deepening; upload client documents instead |
| `TRANSCRIPT_REQUIRED` | 400 | Deepening framework generation still needs a meeting transcript |
| `CLIENT_DOCUMENT_NOT_FOUND` | 404 | Wrong id or another user's opportunity |

## First contact research

After ≥1 document is uploaded, call:

`POST /opportunities/{id}/stage1-research`

Research output includes document provenance under:

`user_statements.client_documents[]` with `document_key`, `file_name`, `section_count`.

## Dependencies

- BT-34 intake fields should be saved before research for best results (not strictly required by upload endpoint).
- BT-36 owns presentation/agenda/email outputs.
- Migration `029_client_documents.sql` must be applied before Supabase-backed environments accept uploads.

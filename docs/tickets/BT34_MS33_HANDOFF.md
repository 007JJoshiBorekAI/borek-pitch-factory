# BT-34 to MS-33 handoff

2026-09-22 · **borek-pitch-factory** branch `bt/bt34-stage1-intake`

**READY:** text-based Stage 1 intake and persistence.  
**NOT READY:** external company research and voice recording.

## Save and reopen the form

```json
{
  "client_name": "Acme",
  "opportunity_name": "Invoice matching",
  "department": "Finance",
  "stage1_intake": {
    "client_web_page": "https://example.com",
    "poc_name": "Ada Lovelace",
    "poc_position": "Operations lead",
    "sales_topic_description": "Explore invoice matching automation",
    "about_company": "Sales reports that the company distributes equipment."
  }
}
```

Use **`client_web_page`** (not `client_website`). Send all five current values when saving an edited form — PATCH replaces the whole object.

## Research UI

`POST /opportunities/{id}/stage1-research` after saving intake. Render unknown facts as **Unknown / research unavailable**. Use `Stage1Research` from generated TypeScript contracts.

## Recording UI

Keep disabled. Nonempty upload returns 503 `STAGE1_VOICE_UNAVAILABLE`.

Full contract: [BT34_STAGE1_INTAKE_API.md](BT34_STAGE1_INTAKE_API.md)

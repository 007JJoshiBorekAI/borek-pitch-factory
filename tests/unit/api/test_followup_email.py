"""Post-meeting follow-up email: finalized V2 sources, saved edits, review, confirmation, export."""

from __future__ import annotations

import copy
import email
import email.policy
import hashlib
import threading
from pathlib import Path
from uuid import UUID, uuid4

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.services.data.memory_store import get_memory_store
from tests.unit.api.test_master_presentation_v2_api import (
    EXCLUDED,
    OBSERVATION,
    OTHER,
    OWNER,
    client,  # noqa: F401 - fixture
    confirm,
    download,
    generate_v2,
    get,
    headers,
    ok,
    post,
    prepared,
)

CHECKS = ["recipients", "dates_and_owners", "supported_statements", "review_flags", "tone", "attachments"]
STATICS = {
    "project_name": "Nordwind Quoting",
    "client_short": "Nordwind",
    "salutation_style": "informal",
    "standard_recipients": [
        {"email": "dana.weber@nordwind.example", "first_name": "Dana", "last_name": "Weber", "salutation": "Ms", "kind": "to", "primary": True},
        {"email": "tom.keller@nordwind.example", "first_name": "Tom", "last_name": "Keller", "kind": "cc"},
    ],
    "sender_profile": {"name": "Jörg Müller", "role": "Managing Partner", "email": "joerg@borek.example"},
}


def set_statics(client: TestClient, opportunity_id: str, statics: dict | None = None, user: UUID = OWNER) -> None:
    response = client.patch(f"/opportunities/{opportunity_id}", headers=headers(user), json={"followup_statics": statics or STATICS})
    assert response.status_code == 200, response.text


def finalized(client: TestClient, user: UUID = OWNER, *, statics: bool = True, excluded: dict | None = None, **kwargs) -> dict:
    """A reviewed and finalized Master Presentation V2 package."""
    base = prepared(client, user, **kwargs)
    opportunity_id = base["opportunity"]
    view = ok(get(client, f"/opportunities/{opportunity_id}/post-meeting-review", user))
    ok(
        post(
            client,
            f"/opportunities/{opportunity_id}/post-meeting-review/confirm",
            {
                "transcript_id": view["extraction"]["transcript_id"],
                "extraction_generated_at": view["extraction"]["generated_at"],
                "review_fingerprint": view["review_fingerprint"],
                "excluded": {"follow_ups": [EXCLUDED]} if excluded is None else excluded,
            },
            user,
        )
    )
    base["v2"] = ok(generate_v2(client, opportunity_id, user))["presentation_version_id"]
    ok(post(client, f"/opportunities/{opportunity_id}/workflow/owner-reviewed", user=user))
    base["package"] = ok(post(client, f"/opportunities/{opportunity_id}/workflow/finalize", user=user))["finalization"]
    if statics:
        set_statics(client, opportunity_id, user=user)
    return base


def root(opportunity_id: str) -> str:
    return f"/opportunities/{opportunity_id}/email-drafts"


def generate(client: TestClient, opportunity_id: str, user: UUID = OWNER, **body):
    return post(client, f"{root(opportunity_id)}/generate", {"journey_stage": "deepening", **body}, user)


def load(client: TestClient, opportunity_id: str, user: UUID = OWNER) -> dict:
    return ok(get(client, f"{root(opportunity_id)}?journey_stage=deepening", user))["draft"]


def patch(client: TestClient, opportunity_id: str, draft_id: str, body: dict, user: UUID = OWNER):
    return client.patch(f"{root(opportunity_id)}/{draft_id}", headers=headers(user), json=body)


def confirm_email(client: TestClient, opportunity_id: str, draft: dict, length: str = "medium", user: UUID = OWNER, **override):
    body = {"selected_length": length, "expected_revision": draft["revision"], "review_checks": CHECKS, "acknowledged_flags": draft["review_flags"], **override}
    return post(client, f"{root(opportunity_id)}/{draft['id']}/confirm", body, user)


def export(client: TestClient, opportunity_id: str, draft: dict, user: UUID = OWNER, revision: int | None = None):
    return get(client, f"{root(opportunity_id)}/{draft['id']}/export?revision={revision or draft['revision']}", user)


def test_three_lengths_are_written_from_the_finalized_v2_package(client: TestClient) -> None:
    base = finalized(client, excluded={"follow_ups": []})
    opportunity_id = base["opportunity"]
    draft = ok(generate(client, opportunity_id))["draft"]

    source = draft["source"]
    assert (source["kind"], source["product_version"]) == ("master_presentation_v2", "V2")
    assert source["presentation_version_id"] == base["v2"] == base["package"]["ppt2_version_id"]
    assert source["presentation_id"] == base["presentation"]
    assert source["snapshot_hash"] == base["package"]["ppt2_generation_source_manifest"]["snapshot_hash"]
    assert source["transcript_id"] == base["transcript"] and source["approved_discovery_version_id"] == base["approved"]
    assert draft["source_status"] == "valid" and draft["status"] == "draft" and draft["send_status"] == "not_sent"
    assert draft["revision"] == 1 and draft["confirmed_revision"] is None and draft["word_limits"] == {"short": 150, "medium": 300, "extensive": 500}

    short, medium, extensive = (draft["lengths"][name] for name in ("short", "medium", "extensive"))
    assert len({short["body"], medium["body"], extensive["body"]}) == 3, "three different drafts"
    assert short["word_count"] <= 150 and medium["word_count"] <= 300 and extensive["word_count"] <= 500
    assert short["word_count"] < medium["word_count"] <= extensive["word_count"]
    for text in (short, medium, extensive):
        assert text["subject"] == "Nordwind Quoting — Follow-up to our meeting" and text["edited"] is False
        assert text["body"].startswith("Hi Dana,\n") and "Jörg Müller" in text["body"] and "Managing Partner - BOREK" in text["body"]
        assert "{{" not in text["body"] and "None" not in text["body"]
        # A discussed solution is never reported as agreed, an owner observation never as a client statement.
        assert OBSERVATION not in text["body"]
        assert "Send the pricing export by Friday." in text["body"], "the confirmed follow-up is a next step"
    assert "Quotes must go out within one day." in short["body"] and "Decisions" not in short["body"]
    assert "Decisions\n- Run a pilot with ten quotes." in medium["body"]
    assert "Also discussed\n- A drafting assistant that prepares the quote from the request." in medium["body"]
    assert "Discussed, not yet decided\n- A drafting assistant" in extensive["body"]
    assert "trade fair" not in extensive["body"], "small talk was never a finding"
    # No date, participant or owner is invented.
    assert "2026" not in extensive["body"] and "Participants" not in extensive["body"]
    assert {"fixture_extraction", "meeting_date_unconfirmed", "owner_notes_omitted", "action_owner_unconfirmed"} <= set(draft["review_flags"])
    assert "action_date_unconfirmed" not in draft["review_flags"], "'by Friday' is the stated deadline"
    assert draft["recipients"] == {
        "to": [{"name": "Dana Weber", "email": "dana.weber@nordwind.example"}],
        "cc": [{"name": "Tom Keller", "email": "tom.keller@nordwind.example"}],
        "sender": {"name": "Jörg Müller", "role": "Managing Partner", "email": "joerg@borek.example"},
    }
    assert load(client, opportunity_id) == draft, "the generated draft is persisted"


def test_excluded_findings_and_later_source_changes_never_reach_the_email(client: TestClient) -> None:
    base = finalized(client)  # the follow-up is excluded
    opportunity_id = base["opportunity"]
    first = ok(generate(client, opportunity_id))["draft"]
    bodies = " ".join(first["lengths"][name]["body"] for name in ("short", "medium", "extensive"))
    assert EXCLUDED not in bodies and "Next steps" not in bodies, "an excluded finding is not an agreed next step, and the empty block is omitted"
    assert "no_next_steps_confirmed" in first["review_flags"] and "action_owner_unconfirmed" not in first["review_flags"]

    # After finalization: a newer transcript, changed notes and a re-analysis. None of it is in the package.
    import io

    later = client.post(
        f"/opportunities/{opportunity_id}/transcripts",
        headers=headers(),
        files={"file": ("later.txt", io.BytesIO(b"Dana: Decision: Cancel the pilot.\nDana: Requirement: Everything must be free.\n"), "text/plain")},
    )
    later_id = ok(later, 201)["transcript"]["id"]
    ok(client.put(f"/opportunities/{opportunity_id}/personal-notes", headers=headers(), json={"text": "Decision: The client wants a discount."}))
    ok(post(client, f"/opportunities/{opportunity_id}/meeting-extraction/generate", {"transcript_id": later_id}))
    again = ok(generate(client, opportunity_id))["draft"]
    assert again["lengths"] == first["lengths"] and again["source"] == first["source"]
    assert again["source"]["transcript_id"] == base["transcript"] != later_id
    assert "Cancel the pilot" not in str(again) and "discount" not in str(again)


def test_generation_needs_a_finalized_package_and_complete_statics(client: TestClient) -> None:
    base = prepared(client)
    opportunity_id = base["opportunity"]
    set_statics(client, opportunity_id)
    early = generate(client, opportunity_id)
    assert early.status_code == 400 and "FOLLOWUP_FINALIZATION_REQUIRED" in early.text, "never from the latest transcript"
    confirm(client, opportunity_id)
    ok(generate_v2(client, opportunity_id))
    ok(post(client, f"/opportunities/{opportunity_id}/workflow/owner-reviewed"))
    not_final = generate(client, opportunity_id)
    assert not_final.status_code == 400 and "FOLLOWUP_FINALIZATION_REQUIRED" in not_final.text
    assert load(client, opportunity_id) is None

    other = finalized(client, statics=False)
    missing = generate(client, other["opportunity"])
    assert missing.status_code == 400 and "FOLLOWUP_STATICS_REQUIRED" in missing.text
    formal = copy.deepcopy(STATICS)
    formal["salutation_style"] = "formal"
    formal["standard_recipients"][0].pop("salutation")
    assert client.patch(f"/opportunities/{other['opportunity']}", headers=headers(), json={"followup_statics": formal}).status_code == 422
    # Statics stored before that rule existed: the greeting is not written with a missing name.
    get_memory_store().opportunities[UUID(other["opportunity"])]["followup_statics"] = copy.deepcopy(formal)
    incomplete = generate(client, other["opportunity"])
    assert incomplete.status_code == 400 and "FOLLOWUP_STATICS_INCOMPLETE" in incomplete.text
    formal["standard_recipients"][0]["salutation"] = "Ms"
    set_statics(client, other["opportunity"], formal)
    assert ok(generate(client, other["opportunity"]))["draft"]["lengths"]["short"]["body"].startswith("Dear Ms Weber,\n")


def test_a_package_whose_frozen_findings_cannot_be_recovered_is_refused(client: TestClient) -> None:
    base = finalized(client)
    opportunity_id = base["opportunity"]
    draft = ok(generate(client, opportunity_id))["draft"]
    store = get_memory_store()
    for job in store.generation_jobs.values():
        snapshot = (job.get("result_json") or {}).get("_enqueue", {}).get("master_v2_snapshot")
        if snapshot:
            snapshot["findings"]["decisions"].append({"text": "The client signed the contract.", "source": "transcript"})
    refused = generate(client, opportunity_id, overwrite_edits=True)
    assert refused.status_code == 409 and "FOLLOWUP_SOURCE_UNAVAILABLE" in refused.text, "altered findings do not match the manifest checksum"
    assert load(client, opportunity_id)["source_status"] == "changed"
    blocked = confirm_email(client, opportunity_id, draft)
    assert blocked.status_code == 409 and "FOLLOWUP_SOURCE_CHANGED" in blocked.text
    assert "signed the contract" not in str(load(client, opportunity_id))


def test_edits_are_saved_per_length_and_survive_reload(client: TestClient) -> None:
    opportunity_id = finalized(client)["opportunity"]
    draft = ok(generate(client, opportunity_id))["draft"]
    draft_id = draft["id"]
    medium = draft["lengths"]["medium"]
    edited_body = medium["body"].replace("thank you for your time in our meeting.", "thank you for the very open conversation in Hamburg.")
    saved = ok(
        patch(
            client,
            opportunity_id,
            draft_id,
            {"expected_revision": 1, "selected_length": "medium", "lengths": {"medium": {"subject": "Nordwind — next steps after our meeting", "body": edited_body}}},
        )
    )["draft"]
    assert saved["revision"] == 2 and saved["selected_length"] == "medium" and saved["status"] == "draft"
    assert saved["lengths"]["medium"] == {
        "subject": "Nordwind — next steps after our meeting",
        "body": edited_body,
        "word_count": saved["lengths"]["medium"]["word_count"],
        "edited": True,
    }
    assert saved["lengths"]["medium"]["word_count"] == medium["word_count"] + 1, "word count follows the saved text"
    assert saved["lengths"]["short"] == draft["lengths"]["short"] and saved["lengths"]["extensive"] == draft["lengths"]["extensive"]

    # Another length is edited later: the first edit stays.
    short_body = draft["lengths"]["short"]["body"].replace("Here is a short summary", "Here is the summary")
    second = ok(patch(client, opportunity_id, draft_id, {"expected_revision": 2, "selected_length": "short", "lengths": {"short": {"subject": draft["lengths"]["short"]["subject"], "body": short_body}}}))["draft"]
    assert second["revision"] == 3 and second["selected_length"] == "short"
    assert second["lengths"]["medium"] == saved["lengths"]["medium"] and second["lengths"]["short"]["edited"] is True
    assert second["lengths"]["extensive"]["edited"] is False

    # Reload and reopen: the exact saved state comes back, from the server.
    assert load(client, opportunity_id) == second
    assert load(TestClient(client.app), opportunity_id) == second
    # Saving the same content again changes nothing.
    assert ok(patch(client, opportunity_id, draft_id, {"expected_revision": 3, "selected_length": "short"}))["draft"]["revision"] == 3


def test_a_stale_edit_is_refused_and_does_not_overwrite(client: TestClient) -> None:
    opportunity_id = finalized(client)["opportunity"]
    draft = ok(generate(client, opportunity_id))["draft"]
    text = draft["lengths"]["short"]
    first = ok(patch(client, opportunity_id, draft["id"], {"expected_revision": 1, "lengths": {"short": {"subject": "From the first editor", "body": text["body"]}}}))["draft"]
    stale = patch(client, opportunity_id, draft["id"], {"expected_revision": 1, "lengths": {"short": {"subject": "From the second editor", "body": text["body"]}}})
    assert stale.status_code == 409 and "EMAIL_DRAFT_CONFLICT" in stale.text
    assert load(client, opportunity_id) == first and first["lengths"]["short"]["subject"] == "From the first editor"

    # Eight simultaneous saves on the same revision: exactly one is stored.
    barrier = threading.Barrier(8)
    codes: list[int] = []

    def save(index: int) -> None:
        barrier.wait()
        response = patch(client, opportunity_id, draft["id"], {"expected_revision": 2, "lengths": {"short": {"subject": f"Editor {index}", "body": text["body"]}}})
        codes.append(response.status_code)

    threads = [threading.Thread(target=save, args=(index,)) for index in range(8)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert sorted(codes) == [200] + [409] * 7
    assert load(client, opportunity_id)["revision"] == 3


def test_edits_are_validated_on_the_server(client: TestClient) -> None:
    opportunity_id = finalized(client)["opportunity"]
    draft = ok(generate(client, opportunity_id))["draft"]
    text = draft["lengths"]["short"]

    def save(subject: str, body: str, length: str = "short"):
        return patch(client, opportunity_id, draft["id"], {"expected_revision": 1, "lengths": {length: {"subject": subject, "body": body}}})

    too_long = text["body"].replace("Best regards", ("word " * 160) + "\n\nBest regards")
    cases = {
        "EMAIL_LENGTH_EXCEEDED": save(text["subject"], too_long),
        "EMAIL_PLACEHOLDER_UNRESOLVED": save(text["subject"], text["body"] + "\n{{next_meeting}}"),
        "EMAIL_SUBJECT_INVALID": save("First line\nBcc: someone@example.com", text["body"]),
        "EMAIL_BODY_INVALID": save(text["subject"], "   \n  "),
    }
    for code, response in cases.items():
        assert response.status_code == 400 and code in response.text, (code, response.text)
    assert save("   ", text["body"]).status_code in (400, 422)
    assert patch(client, opportunity_id, draft["id"], {"expected_revision": 1, "lengths": {"tiny": {"subject": "x", "body": "y"}}}).status_code == 422
    assert patch(client, opportunity_id, draft["id"], {"lengths": {}}).status_code == 422, "a save must name its revision"
    # The same text fits the longer draft.
    assert save(text["subject"], too_long, "medium").status_code == 200
    assert load(client, opportunity_id)["lengths"]["short"] == text


def test_regenerating_never_discards_saved_work_silently(client: TestClient) -> None:
    opportunity_id = finalized(client)["opportunity"]
    draft = ok(generate(client, opportunity_id))["draft"]
    assert ok(generate(client, opportunity_id))["draft"]["revision"] == 2, "an untouched draft can be regenerated"
    text = draft["lengths"]["short"]
    edited = ok(patch(client, opportunity_id, draft["id"], {"expected_revision": 2, "lengths": {"short": {"subject": "My own subject", "body": text["body"]}}}))["draft"]
    refused = generate(client, opportunity_id)
    assert refused.status_code == 409 and "EMAIL_DRAFT_HAS_EDITS" in refused.text
    assert load(client, opportunity_id) == edited
    replaced = ok(generate(client, opportunity_id, overwrite_edits=True))["draft"]
    assert replaced["id"] == draft["id"] and replaced["revision"] == 4
    assert replaced["lengths"]["short"] == text and replaced["status"] == "draft"


def test_confirmation_needs_the_review_and_binds_to_the_saved_revision(client: TestClient) -> None:
    opportunity_id = finalized(client)["opportunity"]
    draft = ok(generate(client, opportunity_id))["draft"]
    url = f"{root(opportunity_id)}/{draft['id']}/confirm"

    bare = post(client, url, {"selected_length": "medium"})
    assert bare.status_code == 400 and "EMAIL_REVISION_REQUIRED" in bare.text
    partial = confirm_email(client, opportunity_id, draft, review_checks=CHECKS[:-1])
    assert partial.status_code == 400 and "EMAIL_REVIEW_INCOMPLETE" in partial.text and "attachments" in partial.text
    unacknowledged = confirm_email(client, opportunity_id, draft, acknowledged_flags=draft["review_flags"][:1])
    assert unacknowledged.status_code == 400 and "EMAIL_REVIEW_FLAGS_OPEN" in unacknowledged.text
    assert load(client, opportunity_id)["status"] == "draft"

    # Someone saves a change while the review is open: the review was of another text.
    text = draft["lengths"]["medium"]
    changed = ok(patch(client, opportunity_id, draft["id"], {"expected_revision": 1, "lengths": {"medium": {"subject": "Changed meanwhile", "body": text["body"]}}}))["draft"]
    stale = confirm_email(client, opportunity_id, draft)
    assert stale.status_code == 409 and "EMAIL_DRAFT_CONFLICT" in stale.text
    assert load(client, opportunity_id)["status"] == "draft"

    confirmed = ok(confirm_email(client, opportunity_id, changed))["draft"]
    assert confirmed["status"] == "confirmed" and confirmed["send_status"] == "not_sent"
    assert confirmed["selected_length"] == "medium" and confirmed["lengths"]["medium"]["subject"] == "Changed meanwhile"
    assert confirmed["revision"] == confirmed["confirmed_revision"] == 3
    assert confirmed["confirmed_by"] == str(OWNER) and confirmed["confirmed_at"]
    assert confirmed["review"] == {"checks": CHECKS, "acknowledged_flags": draft["review_flags"]}
    assert confirmed["source"] == draft["source"], "the source reference is kept"
    actions = {row["action"] for row in get_memory_store().audit_logs.values()}
    assert {"email_draft.generate", "email_draft.update", "email_draft.confirm"} <= actions

    # Nothing was sent, and nothing can be.
    sent = post(client, f"{root(opportunity_id)}/{draft['id']}/send")
    assert sent.status_code == 400 and "EMAIL_SEND_FORBIDDEN" in sent.text
    assert load(client, opportunity_id)["send_status"] == "not_sent"

    # An edit after confirmation withdraws it until the owner reviews again.
    reopened = ok(patch(client, opportunity_id, draft["id"], {"expected_revision": 3, "lengths": {"medium": {"subject": "Edited after confirmation", "body": text["body"]}}}))["draft"]
    assert reopened["status"] == "draft" and reopened["confirmed_revision"] is None and reopened["confirmed_at"] is None and reopened["review"] is None
    not_confirmed = export(client, opportunity_id, reopened)
    assert not_confirmed.status_code == 409 and "EMAIL_NOT_CONFIRMED" in not_confirmed.text
    again = ok(confirm_email(client, opportunity_id, reopened, "short"))["draft"]
    assert again["status"] == "confirmed" and again["selected_length"] == "short" and again["confirmed_revision"] == 5


def test_attachments_are_the_approved_files_of_the_finalized_version(client: TestClient) -> None:
    base = finalized(client)
    opportunity_id, presentation_id = base["opportunity"], base["presentation"]
    draft = ok(generate(client, opportunity_id))["draft"]
    pptx, pdf = draft["attachments"]
    assert (pptx["format"], pdf["format"]) == ("pptx", "pdf")
    assert pptx["file_name"] == "Master Presentation - Nordwind Maschinenbau - V2.pptx" and pdf["file_name"].endswith(" - V2.pdf")
    for item in (pptx, pdf):
        assert item["presentation_version_id"] == base["v2"] and item["presentation_id"] == presentation_id
        assert item["available"] is True and item["product_version"] == "V2"
    approved = {kind: download(client, presentation_id, base["v2"], kind) for kind in ("pptx", "pdf")}
    assert pptx["size_bytes"] == len(approved["pptx"]) and pdf["size_bytes"] == len(approved["pdf"])
    assert (pptx["selected"], pdf["selected"]) == (False, True), "the selection is stored, not implied"

    chosen = ok(patch(client, opportunity_id, draft["id"], {"expected_revision": 1, "attachments": {"pptx": True}}))["draft"]
    assert [item["selected"] for item in chosen["attachments"]] == [True, True] and chosen["revision"] == 2
    assert [item["selected"] for item in load(client, opportunity_id)["attachments"]] == [True, True]

    unconfirmed = export(client, opportunity_id, chosen)
    assert unconfirmed.status_code == 409 and "EMAIL_NOT_CONFIRMED" in unconfirmed.text
    confirmed = ok(confirm_email(client, opportunity_id, chosen, "extensive"))["draft"]
    stale = export(client, opportunity_id, confirmed, revision=confirmed["revision"] - 1)
    assert stale.status_code == 409 and "EMAIL_EXPORT_STALE" in stale.text

    response = export(client, opportunity_id, confirmed)
    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("message/rfc822")
    assert response.headers["content-disposition"] == 'attachment; filename="Nordwind Quoting - follow-up email.eml"'
    assert b"\r\n" in response.content and b"\n" not in response.content.replace(b"\r\n", b""), "CRLF line ends"
    message = email.message_from_bytes(response.content, policy=email.policy.default)
    assert message["MIME-Version"] == "1.0" and message["X-Unsent"] == "1"
    assert message["From"] == "Jörg Müller <joerg@borek.example>"
    assert message["To"] == "Dana Weber <dana.weber@nordwind.example>" and message["Cc"] == "Tom Keller <tom.keller@nordwind.example>"
    assert message["Subject"] == confirmed["lengths"]["extensive"]["subject"]
    assert message["Message-ID"].endswith("@borek.example>") and message["Date"]
    assert message["X-Borek-Draft-Id"] == confirmed["id"] and message["X-Borek-Draft-Revision"] == str(confirmed["revision"])
    assert message["X-Borek-Presentation-Version-Id"] == base["v2"]
    assert b"=?utf-8?" in response.content.split(b"\r\n\r\n")[0].lower(), "non-ASCII header text is RFC 2047 encoded"
    body = message.get_body(preferencelist=("plain",))
    assert body.get_content_type() == "text/plain" and body.get_content_charset() == "utf-8"
    assert body["Content-Transfer-Encoding"] == "quoted-printable"
    assert "\n".join(body.get_content().splitlines()).strip() == confirmed["lengths"]["extensive"]["body"]
    files = {part.get_filename(): part for part in message.iter_attachments()}
    assert list(files) == ["Master Presentation - Nordwind Maschinenbau - V2.pptx", "Master Presentation - Nordwind Maschinenbau - V2.pdf"]
    assert files[pptx["file_name"]].get_content_type() == "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    assert files[pdf["file_name"]].get_content_type() == "application/pdf"
    assert files[pptx["file_name"]].get_content() == approved["pptx"], "the exact approved PPTX bytes"
    assert files[pdf["file_name"]].get_content() == approved["pdf"], "the exact approved PDF bytes"
    assert hashlib.sha256(files[pdf["file_name"]].get_content()).hexdigest() == hashlib.sha256(approved["pdf"]).hexdigest()
    # Exporting changes nothing and sends nothing.
    after = load(client, opportunity_id)
    assert after == confirmed and after["send_status"] == "not_sent"

    # Only what is selected is attached.
    none = ok(patch(client, opportunity_id, draft["id"], {"expected_revision": confirmed["revision"], "attachments": {"pptx": False, "pdf": False}}))["draft"]
    assert none["status"] == "draft", "changing the package withdraws the confirmation"
    plain = export(client, opportunity_id, ok(confirm_email(client, opportunity_id, none))["draft"])
    parsed = email.message_from_bytes(plain.content, policy=email.policy.default)
    assert not parsed.is_multipart() and list(parsed.iter_attachments()) == [] and parsed["X-Borek-Presentation-Version-Id"] is None


def test_a_missing_approved_file_is_reported_and_never_replaced(client: TestClient) -> None:
    base = finalized(client)
    opportunity_id = base["opportunity"]
    draft = ok(generate(client, opportunity_id))["draft"]
    confirmed = ok(confirm_email(client, opportunity_id, draft))["draft"]
    version = get_memory_store().presentation_versions[UUID(base["v2"])]
    pdf_path = Path(version["pdf_storage_path"])
    kept = pdf_path.read_bytes()
    pdf_path.unlink()
    try:
        listed = load(client, opportunity_id)["attachments"]
        assert [(item["format"], item["available"], item["size_bytes"]) for item in listed][1] == ("pdf", False, None)
        assert listed[1]["selected"] is True and listed[1]["presentation_version_id"] == base["v2"]
        missing = export(client, opportunity_id, confirmed)
        assert missing.status_code == 409 and "EMAIL_ATTACHMENT_UNAVAILABLE" in missing.text
        reopened = ok(patch(client, opportunity_id, draft["id"], {"expected_revision": confirmed["revision"], "selected_length": "short"}))["draft"]
        blocked = confirm_email(client, opportunity_id, reopened)
        assert blocked.status_code == 409 and "EMAIL_ATTACHMENT_UNAVAILABLE" in blocked.text
    finally:
        pdf_path.write_bytes(kept)


def test_drafts_and_exports_are_scoped_to_the_owner_and_the_opportunity(client: TestClient) -> None:
    mine = finalized(client)
    theirs = finalized(client, OTHER)
    my_draft = ok(generate(client, mine["opportunity"]))["draft"]
    their_draft = ok(generate(client, theirs["opportunity"], OTHER))["draft"]
    confirmed = ok(confirm_email(client, mine["opportunity"], my_draft))["draft"]

    assert get(client, f"{root(mine['opportunity'])}?journey_stage=deepening", OTHER).status_code == 404
    assert generate(client, mine["opportunity"], OTHER).status_code == 404
    assert patch(client, mine["opportunity"], my_draft["id"], {"expected_revision": confirmed["revision"], "selected_length": "short"}, OTHER).status_code == 404
    assert confirm_email(client, mine["opportunity"], confirmed, user=OTHER).status_code == 404
    assert export(client, mine["opportunity"], confirmed, OTHER).status_code == 404
    # A draft id from another opportunity is not found under mine, whoever asks.
    cross = patch(client, mine["opportunity"], their_draft["id"], {"expected_revision": 1, "selected_length": "short"})
    assert cross.status_code == 404 and "EMAIL_DRAFT_NOT_FOUND" in cross.text
    assert export(client, mine["opportunity"], their_draft).status_code == 404
    assert post(client, f"{root(mine['opportunity'])}/{their_draft['id']}/confirm", {"selected_length": "short"}).status_code == 404
    assert load(client, mine["opportunity"]) == confirmed
    assert their_draft["source"]["presentation_version_id"] == theirs["v2"] != mine["v2"]


def test_other_stages_and_standalone_ppt2_opportunities_keep_their_drafts(client: TestClient) -> None:
    """first_contact, concretisation and a transcript-based deepening draft are unchanged in substance."""
    import io

    created = client.post(
        "/opportunities",
        headers=headers(),
        json={"client_name": "Acme", "opportunity_name": "Invoice pilot", "department": "Sales", "followup_statics": STATICS},
    )
    opportunity_id = ok(created, 201)["id"]
    first = ok(post(client, f"{root(opportunity_id)}/generate", {"journey_stage": "first_contact"}))["draft"]
    assert first["source"] is None and first["attachments"] == [] and first["source_status"] == "not_applicable"
    assert first["revision"] == 1 and "First contact" in first["lengths"]["short"]["subject"]
    # The earlier confirm call - a length and nothing else - still works.
    plain = ok(post(client, f"{root(opportunity_id)}/{first['id']}/confirm", {"selected_length": "short"}))["draft"]
    assert plain["status"] == "confirmed" and plain["revision"] == 2 and plain["review"] is None
    exported = get(client, f"{root(opportunity_id)}/{first['id']}/export?revision=2")
    assert exported.status_code == 200 and not email.message_from_bytes(exported.content, policy=email.policy.default).is_multipart()
    attach = client.patch(f"{root(opportunity_id)}/{first['id']}", headers=headers(), json={"expected_revision": 2, "attachments": {"pdf": True}})
    assert attach.status_code == 400 and "EMAIL_ATTACHMENT_UNAVAILABLE" in attach.text, "no approved version, nothing to attach"

    # Deepening without a Master Presentation: the transcript-based draft, as before.
    uploaded = client.post(
        f"/opportunities/{opportunity_id}/transcripts",
        headers=headers(),
        files={"file": ("meeting.txt", io.BytesIO(b"Markus: We will send the sample invoices by 12.10.2026.\nLena: Decision: Start with one entity.\n"), "text/plain")},
    )
    assert uploaded.status_code == 201, uploaded.text
    legacy = ok(post(client, f"{root(opportunity_id)}/generate", {"journey_stage": "deepening"}))["draft"]
    assert legacy["source"] is None and legacy["attachments"] == [] and legacy["review_flags"] == []
    assert "Follow-up" in legacy["lengths"]["medium"]["subject"] and legacy["lengths"]["medium"]["body"].startswith("Hi Dana,")
    assert ok(post(client, f"{root(opportunity_id)}/{legacy['id']}/confirm", {"selected_length": "medium"}))["draft"]["status"] == "confirmed"
    assert post(client, f"{root(opportunity_id)}/generate", {"journey_stage": "concretisation"}).status_code in (200, 400, 403)


def test_drafts_of_different_stages_are_saved_side_by_side(client: TestClient) -> None:
    """A save of one stage never replaces another stage's draft, whatever happens at the same moment."""
    opportunity_id = finalized(client)["opportunity"]
    deepening = ok(generate(client, opportunity_id))["draft"]
    first = ok(post(client, f"{root(opportunity_id)}/generate", {"journey_stage": "first_contact"}))["draft"]
    assert first["id"] != deepening["id"] and load(client, opportunity_id) == deepening, "generating one stage leaves the other untouched"

    def first_contact() -> dict:
        return ok(get(client, f"{root(opportunity_id)}?journey_stage=first_contact"))["draft"]

    for round_number in range(6):
        deepening, first = load(client, opportunity_id), first_contact()
        barrier = threading.Barrier(2)
        answers: dict[str, int] = {}
        text = deepening["lengths"]["short"]

        def edit_deepening() -> None:
            barrier.wait()
            body = {"expected_revision": deepening["revision"], "lengths": {"short": {"subject": f"Deepening round {round_number}", "body": text["body"]}}}
            answers["deepening"] = patch(client, opportunity_id, deepening["id"], body).status_code

        def change_first_contact() -> None:
            barrier.wait()
            if round_number % 3 == 0:  # confirm
                response = post(client, f"{root(opportunity_id)}/{first['id']}/confirm", {"selected_length": "short", "expected_revision": first["revision"]})
            elif round_number % 3 == 1:  # save
                body = {"expected_revision": first["revision"], "lengths": {"medium": {"subject": f"First contact round {round_number}", "body": first["lengths"]["medium"]["body"]}}}
                response = patch(client, opportunity_id, first["id"], body)
            else:  # regenerate
                response = post(client, f"{root(opportunity_id)}/generate", {"journey_stage": "first_contact", "overwrite_edits": True})
            answers["first_contact"] = response.status_code

        threads = [threading.Thread(target=edit_deepening), threading.Thread(target=change_first_contact)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        assert answers == {"deepening": 200, "first_contact": 200}, (round_number, answers)
        after_deepening, after_first = load(client, opportunity_id), first_contact()
        assert after_deepening["revision"] == deepening["revision"] + 1 and after_deepening["lengths"]["short"]["subject"] == f"Deepening round {round_number}"
        assert after_first["revision"] == first["revision"] + 1, "the other stage's change is stored as well"
        if round_number % 3 == 0:
            assert after_first["status"] == "confirmed"
        elif round_number % 3 == 1:
            assert after_first["lengths"]["medium"]["subject"] == f"First contact round {round_number}"
        else:
            assert after_first["status"] == "draft" and after_first["lengths"]["medium"]["edited"] is False
    assert load(client, opportunity_id)["source"]["kind"] == "master_presentation_v2", "the pinned source survived every round"


def test_two_api_processes_save_atomically_per_stage(monkeypatch: pytest.MonkeyPatch) -> None:
    """Separate store instances over one database: the function of migration 043 decides.

    The store sends one stage's draft and the revision it expects. It never sends the whole
    ``email_drafts`` object back, so what it read earlier cannot replace another stage's change.
    """
    from app.services.data.supabase_store import SupabaseDataStore

    opportunity_id, user_id = uuid4(), uuid4()
    row = {"id": str(opportunity_id), "created_by": str(user_id), "pitch_owner_id": str(user_id), "client_name": "Acme", "opportunity_name": "Pilot", "email_drafts": None,
           "created_at": "2026-10-09T08:00:00+00:00", "updated_at": "2026-10-09T08:00:00+00:00"}
    guard = threading.Lock()
    calls: list[dict] = []
    snapshots: list[dict] = []  # what a process read before it wrote

    def request(self, method, name, *, json_body=None, params=None, headers=None):
        assert (method, name) == ("POST", "rpc/save_email_draft"), "no PATCH of the whole email_drafts object"
        assert set(json_body) == {"p_opportunity_id", "p_journey_stage", "p_expected_revision", "p_draft"}
        with guard:  # the UPDATE in save_email_draft locks the row: one statement at a time
            calls.append(copy.deepcopy(json_body))
            stage, expected = json_body["p_journey_stage"], json_body["p_expected_revision"]
            drafts = row["email_drafts"] if isinstance(row["email_drafts"], dict) else {}
            existing = drafts.get(stage)
            matches = existing is None if expected is None else (existing is not None and int(existing.get("revision") or 1) == expected)
            if json_body["p_opportunity_id"] != row["id"] or not matches:
                return httpx.Response(200, json=None)
            row["email_drafts"] = {**drafts, stage: copy.deepcopy(json_body["p_draft"])}  # jsonb_set on the current value
            return httpx.Response(200, json=copy.deepcopy(json_body["p_draft"]))

    def fetch(self, _id):
        with guard:
            snapshot = copy.deepcopy(row)
        snapshots.append(snapshot)
        return snapshot

    monkeypatch.setattr(SupabaseDataStore, "_request", request)
    monkeypatch.setattr(SupabaseDataStore, "_fetch_opportunity_row", fetch)
    monkeypatch.setattr("app.services.pitch_owner.user_can_access_opportunity", lambda _row, _user: True)
    stores = [SupabaseDataStore(f"token-of-process-{index}") for index in range(6)]
    lengths = {name: {"subject": "s", "body": "b", "word_count": 1} for name in ("short", "medium", "extensive")}

    def save(store: SupabaseDataStore, stage: str, expected: int | None, **extra) -> object:
        try:
            return store.save_email_draft(opportunity_id=opportunity_id, user_id=user_id, journey_stage=stage,
                                          draft={"status": "draft", "selected_length": None, "lengths": lengths, **extra}, expected_revision=expected)
        except HTTPException as exc:
            return exc

    def race(jobs: list[tuple[str, int | None]]) -> list[object]:
        barrier = threading.Barrier(len(jobs))
        outcomes: list[object] = [None] * len(jobs)

        def run(index: int) -> None:
            barrier.wait()
            outcomes[index] = save(stores[index % len(stores)], jobs[index][0], jobs[index][1], editor=index)

        threads = [threading.Thread(target=run, args=(index,)) for index in range(len(jobs))]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        return outcomes

    # The same draft: one of six processes wins, at creation and at every later revision.
    created = race([("deepening", None)] * 6)
    winners = [item for item in created if isinstance(item, dict)]
    assert len(winners) == 1 and all(getattr(item, "status_code", None) == 409 for item in created if not isinstance(item, dict))
    assert row["email_drafts"]["deepening"]["revision"] == 1 and row["email_drafts"]["deepening"]["editor"] == winners[0]["editor"]
    assert calls[0]["p_expected_revision"] is None, "the first write requires that no draft exists"
    updated = race([("deepening", 1)] * 6)
    winners = [item for item in updated if isinstance(item, dict)]
    assert len(winners) == 1 and winners[0]["revision"] == 2 and row["email_drafts"]["deepening"]["editor"] == winners[0]["editor"]
    stale = save(stores[0], "deepening", 1)
    assert getattr(stale, "status_code", None) == 409 and "EMAIL_DRAFT_CONFLICT" in str(stale.detail)

    # Different stages at the same moment: every one of them is stored.
    both = race([("first_contact", None), ("deepening", 2), ("concretisation", None)])
    assert all(isinstance(item, dict) for item in both), both
    assert {stage: draft["revision"] for stage, draft in row["email_drafts"].items()} == {"deepening": 3, "first_contact": 1, "concretisation": 1}
    for _round in range(5):
        revisions = {stage: draft["revision"] for stage, draft in row["email_drafts"].items()}
        outcome = race([("first_contact", revisions["first_contact"]), ("deepening", revisions["deepening"]), ("concretisation", revisions["concretisation"])])
        assert all(isinstance(item, dict) for item in outcome)
        assert {stage: draft["revision"] for stage, draft in row["email_drafts"].items()} == {stage: number + 1 for stage, number in revisions.items()}

    # The lost update, step by step: a process reads, another stage is saved, then the first one writes.
    snapshots.clear()
    stale_view = copy.deepcopy(row)
    assert isinstance(save(stores[1], "first_contact", row["email_drafts"]["first_contact"]["revision"], note="saved in between"), dict)
    monkeypatch.setattr(SupabaseDataStore, "_fetch_opportunity_row", lambda self, _id: copy.deepcopy(stale_view))
    late = save(stores[2], "deepening", stale_view["email_drafts"]["deepening"]["revision"], note="written from an old read")
    assert isinstance(late, dict), "its own stage had not changed, so the save is accepted"
    assert row["email_drafts"]["first_contact"]["note"] == "saved in between", "the other stage's newer draft is still there"
    assert row["email_drafts"]["deepening"]["note"] == "written from an old read"
    assert "email_drafts" not in calls[-1] and calls[-1]["p_journey_stage"] == "deepening"

    migration = (Path(__file__).resolve().parents[3] / "apps/services/api/supabase/migrations/043_email_draft_atomic_save.sql").read_text(encoding="utf-8")
    assert "CREATE OR REPLACE FUNCTION public.save_email_draft(" in migration and "SECURITY INVOKER" in migration
    assert "jsonb_set(" in migration and "ARRAY[p_journey_stage]" in migration, "only the named stage is replaced"
    assert "COALESCE((email_drafts -> p_journey_stage ->> 'revision')::integer, 1) = p_expected_revision" in migration
    assert "GRANT EXECUTE ON FUNCTION public.save_email_draft(UUID, TEXT, INTEGER, JSONB) TO authenticated, service_role" in migration
    assert "SECURITY DEFINER" not in migration and "CREATE TABLE" not in migration and "CREATE POLICY" not in migration.upper()

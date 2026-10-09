"""Post-meeting follow-up email: finalized sources, saved edits, review, confirmation, export.

Nothing in this module sends mail. A confirmed draft is a reviewed draft; the export is a file
the owner opens and sends from their own mail program after their own check.

For a Master Presentation opportunity the email is written from the package that was finalized:

    finalization snapshot   names the reviewed V2 version and carries its generation manifest
    frozen V2 snapshot      the confirmed findings that version was generated from, kept with the
                            generation job and identified by the manifest's snapshot checksum
    project statics         recipient, salutation and sender the owner entered

Later changes to the transcript, the notes, the Discovery draft or the findings do not reach the
email: they are not part of the finalized package. Earlier opportunities with a standalone
PPT #2 keep the transcript-based draft unchanged.

Every write names the draft revision it is based on and is refused when the draft has moved on,
so two people cannot overwrite each other. Editing a confirmed draft withdraws the confirmation.
"""

from __future__ import annotations

import hashlib
import re
from datetime import UTC, datetime
from email.message import EmailMessage
from email.policy import SMTP
from email.utils import format_datetime, formataddr, make_msgid
from typing import Any
from uuid import UUID

from fastapi import HTTPException

from app.services import deck_center
from app.services.api_errors import bad_request, conflict
from services.followup.finalized import (
    LENGTHS,
    RENDERER_VERSION,
    WORD_CAPS,
    ContentDoesNotFit,
    NoConfirmedContent,
    content_from_snapshot,
    render_finalized_lengths,
)
from services.followup.rendering import draft_has_placeholders, followup_content_word_count
from services.presentation.master_deck.plan import MANIFEST_KIND_V2, MASTER_MANIFEST_KINDS
from services.presentation.master_deck.v2 import snapshot_hash

SOURCE_KIND_V2 = "master_presentation_v2"
REVIEW_CHECKS = ("recipients", "dates_and_owners", "supported_statements", "review_flags", "tone", "attachments")
ATTACHMENT_FORMATS = ("pptx", "pdf")
MEDIA_TYPES = {
    "pptx": ("application", "vnd.openxmlformats-officedocument.presentationml.presentation"),
    "pdf": ("application", "pdf"),
}
MAX_SUBJECT_CHARS = 200
MAX_BODY_CHARS = 20000


def _now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def revision_of(stored: dict[str, Any]) -> int:
    """A draft written before revisions existed is revision 1."""
    return int(stored.get("revision") or 1)


# ----------------------------------------------------------------------------- finalized sources


def _is_master_journey(store: Any, *, opportunity_id: UUID, user_id: UUID) -> bool:
    for row in store.list_presentation_versions_for_opportunity(opportunity_id=opportunity_id, user_id=user_id):
        manifest = row.get("generation_source_manifest")
        if isinstance(manifest, dict) and manifest.get("kind") in MASTER_MANIFEST_KINDS:
            return True
    return False


def _unavailable(message: str) -> HTTPException:
    return conflict("FOLLOWUP_SOURCE_UNAVAILABLE", message)


def resolve_finalized_source(store: Any, *, opportunity: dict[str, Any], opportunity_id: UUID, user_id: UUID) -> tuple[dict[str, Any], dict[str, Any]] | None:
    """The reviewed V2 version of a finalized Master Presentation package and its frozen sources.

    Returns None for an opportunity that never had a Master Presentation (standalone PPT #2).
    """
    package = opportunity.get("finalization_snapshot")
    finalized = bool(opportunity.get("finalized_at")) and isinstance(package, dict)
    manifest = package.get("ppt2_generation_source_manifest") if finalized else None
    if not finalized or not isinstance(manifest, dict) or manifest.get("kind") != MANIFEST_KIND_V2:
        if finalized and isinstance(manifest, dict):
            return None  # finalized with a standalone PPT #2
        if _is_master_journey(store, opportunity_id=opportunity_id, user_id=user_id):
            raise bad_request(
                "FOLLOWUP_FINALIZATION_REQUIRED",
                "Review and finalize Master Presentation V2 before preparing the follow-up email.",
            )
        return None
    version_id = str(package["ppt2_version_id"])
    try:
        version = store.get_presentation_version(presentation_version_id=UUID(version_id), user_id=user_id)
    except HTTPException as exc:
        raise _unavailable("The finalized presentation version is no longer available.") from exc
    stored_manifest = version.get("generation_source_manifest")
    status = version.get("status")
    if (
        str(getattr(status, "value", status)) != "ready"
        or not isinstance(stored_manifest, dict)
        or stored_manifest.get("snapshot_hash") != manifest.get("snapshot_hash")
        or str(version.get("presentation_id")) != str(package["ppt2_presentation_id"])
    ):
        raise _unavailable("The finalized presentation version no longer matches the finalized package.")
    frozen = None
    for job in store.list_generation_jobs_for_opportunity(opportunity_id):
        result = job.get("result_json") if isinstance(job.get("result_json"), dict) else {}
        candidate = (result.get("_enqueue") or {}).get("master_v2_snapshot")
        if isinstance(candidate, dict) and snapshot_hash(candidate) == manifest.get("snapshot_hash"):
            frozen = candidate
            break
    if frozen is None or str(frozen.get("opportunity_id")) != str(opportunity_id):
        # Without the frozen findings the email could only be written from live state. It is not.
        raise _unavailable("The confirmed findings of the finalized presentation could not be recovered.")
    source = {
        "kind": SOURCE_KIND_V2,
        "product_version": "V2",
        "finalized_at": str(package["captured_at"]),
        "presentation_id": str(package["ppt2_presentation_id"]),
        "presentation_version_id": version_id,
        "version_number": int(version.get("version_number") or 0),
        "snapshot_hash": str(manifest["snapshot_hash"]),
        "generation_fingerprint": manifest.get("generation_fingerprint"),
        "approved_discovery_version_id": manifest.get("approved_discovery_version_id"),
        "transcript_id": manifest.get("transcript_id"),
        "transcript_revision": manifest.get("transcript_revision"),
        "meeting_review_confirmed_at": manifest.get("meeting_review_confirmed_at"),
        "extraction_execution_mode": manifest.get("meeting_extraction_execution_mode"),
        "confirmed_finding_count": manifest.get("confirmed_finding_count"),
        "excluded_finding_count": manifest.get("excluded_finding_count"),
        "renderer_version": RENDERER_VERSION,
    }
    return source, frozen


def require_complete_statics(statics: Any) -> dict[str, Any]:
    """Recipient, salutation and sender must be entered by the owner; nothing is guessed."""
    if not isinstance(statics, dict) or not statics.get("project_name"):
        raise bad_request(
            "FOLLOWUP_STATICS_REQUIRED",
            "Enter the project name, recipient and sender before generating the follow-up email.",
        )
    recipients = [item for item in statics.get("standard_recipients") or [] if isinstance(item, dict)]
    primary = next((item for item in recipients if item.get("kind") == "to" and item.get("primary")), recipients[0] if recipients else None)
    sender = statics.get("sender_profile") or {}
    formal = statics.get("salutation_style") == "formal"
    named = primary is not None and (
        (primary.get("salutation") and primary.get("last_name")) if formal else primary.get("first_name")
    )
    if not named or not sender.get("name") or not sender.get("email"):
        raise bad_request(
            "FOLLOWUP_STATICS_INCOMPLETE",
            "The recipient needs a first name (informal) or a salutation and last name (formal), and the sender a name and address.",
        )
    return statics


def master_generation(store: Any, *, opportunity: dict[str, Any], opportunity_id: UUID, user_id: UUID) -> dict[str, Any] | None:
    """Draft content from the finalized V2 package, or None for a standalone PPT #2 opportunity."""
    resolved = resolve_finalized_source(store, opportunity=opportunity, opportunity_id=opportunity_id, user_id=user_id)
    if resolved is None:
        return None
    source, frozen = resolved
    statics = require_complete_statics(opportunity.get("followup_statics"))
    try:
        content = content_from_snapshot(frozen)
        lengths, flags = render_finalized_lengths(content, statics)
    except (NoConfirmedContent, ContentDoesNotFit) as exc:
        raise bad_request(exc.code, str(exc)) from exc
    over = [name for name in LENGTHS if lengths[name]["word_count"] > WORD_CAPS[name]]
    if over:  # the renderer guarantees this; a draft over its cap is never stored
        raise bad_request("FOLLOWUP_CONTENT_TOO_LONG", f"The generated {over[0]} draft exceeds its word limit.")
    return {"lengths": lengths, "review_flags": flags, "source": source}


# ----------------------------------------------------------------------------- stored draft


def _recipients(statics: Any) -> dict[str, Any] | None:
    if not isinstance(statics, dict):
        return None
    sender = statics.get("sender_profile") or {}
    people: dict[str, list[dict[str, Any]]] = {"to": [], "cc": []}
    ordered = sorted(statics.get("standard_recipients") or [], key=lambda item: not item.get("primary"))
    for item in ordered:
        name = " ".join(part for part in (item.get("first_name"), item.get("last_name")) if part)
        people["cc" if item.get("kind") == "cc" else "to"].append({"name": name or None, "email": str(item.get("email") or "").strip()})
    if not people["to"] or not sender.get("email"):
        return None
    return {
        **people,
        "sender": {"name": str(sender.get("name") or "").strip(), "role": sender.get("role"), "email": str(sender.get("email")).strip()},
    }


def _safe_name(value: str) -> str:
    cleaned = re.sub(r"[^\w .()-]+", "-", value.replace("—", "-").replace("–", "-"), flags=re.UNICODE)
    return re.sub(r"\s*-[\s-]*", " - ", cleaned).strip(" -.") or "Master Presentation"


def attachments_for(store: Any, *, stored: dict[str, Any], user_id: UUID) -> list[dict[str, Any]]:
    """The approved files of the pinned V2 version, with the owner's persisted selection.

    Only the version named by the finalized source is offered - never a newer one.
    """
    source = stored.get("source")
    if not isinstance(source, dict) or source.get("kind") != SOURCE_KIND_V2:
        return []
    selection = stored.get("attachment_selection") or {}
    presentation_id = UUID(str(source["presentation_id"]))
    version_id = UUID(str(source["presentation_version_id"]))
    try:
        title = str(store.get_presentation(presentation_id=presentation_id, user_id=user_id).get("name") or "")
    except HTTPException:
        title = ""
    base = f"{_safe_name(title or 'Master Presentation')} - V2"
    items = []
    for kind in ATTACHMENT_FORMATS:
        item = {
            "format": kind,
            "file_name": f"{base}.{kind}",
            "selected": bool(selection.get(kind)),
            "available": False,
            "size_bytes": None,
            "presentation_id": str(presentation_id),
            "presentation_version_id": str(version_id),
            "version_number": source.get("version_number"),
            "product_version": "V2",
        }
        try:
            path = deck_center.resolve_deck_file_path(
                store, presentation_id=presentation_id, user_id=user_id, kind=kind, presentation_version_id=version_id
            )
            item["available"] = True
            item["size_bytes"] = path.stat().st_size
            item["_path"] = path
        except (HTTPException, OSError):
            pass
        items.append(item)
    return items


def source_status(store: Any, *, stored: dict[str, Any], opportunity: dict[str, Any], opportunity_id: UUID, user_id: UUID) -> str:
    source = stored.get("source")
    if not isinstance(source, dict) or source.get("kind") != SOURCE_KIND_V2:
        return "not_applicable"
    try:
        resolved = resolve_finalized_source(store, opportunity=opportunity, opportunity_id=opportunity_id, user_id=user_id)
    except HTTPException:
        return "changed"
    if resolved is None:
        return "changed"
    current = resolved[0]
    same = all(current[key] == source.get(key) for key in ("presentation_id", "presentation_version_id", "snapshot_hash"))
    return "valid" if same else "changed"


def public_fields(store: Any, *, stored: dict[str, Any], opportunity: dict[str, Any], opportunity_id: UUID, user_id: UUID) -> dict[str, Any]:
    """Everything the envelope shows beyond the three texts."""
    confirmed = stored.get("status") == "confirmed"
    attachments = [{key: value for key, value in item.items() if not key.startswith("_")} for item in attachments_for(store, stored=stored, user_id=user_id)]
    return {
        "revision": revision_of(stored),
        "confirmed_revision": stored.get("confirmed_revision") if confirmed else None,
        "confirmed_by": str(stored["confirmed_by"]) if confirmed and stored.get("confirmed_by") else None,
        "source": stored.get("source"),
        "source_status": source_status(store, stored=stored, opportunity=opportunity, opportunity_id=opportunity_id, user_id=user_id),
        "review_flags": list(stored.get("review_flags") or []),
        "review": stored.get("review") if confirmed else None,
        "recipients": (stored.get("recipients") if confirmed else None) or _recipients(opportunity.get("followup_statics")),
        "attachments": attachments,
        "word_limits": dict(WORD_CAPS),
    }


def envelope(store: Any, *, opportunity_id: UUID, user_id: UUID, journey_stage: str, stored: dict[str, Any] | None, opportunity: dict[str, Any] | None = None) -> dict[str, Any]:
    from app.services.journey_generation import envelope_from_stored

    if stored is None:
        return envelope_from_stored(opportunity_id, journey_stage, None)
    opportunity = opportunity or store.get_opportunity(opportunity_id=opportunity_id, user_id=user_id)
    extra = public_fields(store, stored=stored, opportunity=opportunity, opportunity_id=opportunity_id, user_id=user_id)
    return envelope_from_stored(opportunity_id, journey_stage, stored, extra=extra)


# ----------------------------------------------------------------------------- generate


def has_owner_work(stored: dict[str, Any] | None) -> bool:
    """Edited text, or a confirmed draft: regenerating would discard something the owner did."""
    if not stored:
        return False
    edited = any(bool((stored.get("lengths") or {}).get(name, {}).get("edited")) for name in LENGTHS)
    return edited or (stored.get("status") == "confirmed" and isinstance(stored.get("source"), dict))


def store_generated(
    store: Any,
    *,
    opportunity: dict[str, Any],
    opportunity_id: UUID,
    user_id: UUID,
    journey_stage: str,
    lengths: dict[str, dict[str, Any]],
    source: dict[str, Any] | None,
    review_flags: list[str],
    overwrite_edits: bool,
) -> dict[str, Any]:
    existing = store.get_email_draft(opportunity_id=opportunity_id, user_id=user_id, journey_stage=journey_stage)
    if has_owner_work(existing) and not overwrite_edits:
        raise conflict(
            "EMAIL_DRAFT_HAS_EDITS",
            "This draft contains saved edits or a confirmation. Regenerating replaces all three lengths.",
        )
    selection = {}
    if source is not None:
        previous = (existing or {}).get("source") or {}
        same_version = previous.get("presentation_version_id") == source["presentation_version_id"]
        selection = dict((existing or {}).get("attachment_selection") or {}) if same_version else {"pptx": False, "pdf": True}
    stored = store.save_email_draft(
        opportunity_id=opportunity_id,
        user_id=user_id,
        journey_stage=journey_stage,
        draft={
            "status": "draft",
            "selected_length": existing.get("selected_length") if existing else None,
            "lengths": {name: {**lengths[name], "edited": False} for name in LENGTHS},
            "confirmed_at": None,
            "confirmed_revision": None,
            "confirmed_by": None,
            "source": source,
            "review_flags": list(review_flags),
            "attachment_selection": selection,
            "review": None,
            "recipients": None,
        },
        expected_revision=None if existing is None else revision_of(existing),
    )
    return envelope(store, opportunity_id=opportunity_id, user_id=user_id, journey_stage=journey_stage, stored=stored)


# ----------------------------------------------------------------------------- edit


def _checked_text(name: str, subject: Any, body: Any) -> dict[str, Any]:
    raw = str(subject or "")
    subject = None if "\n" in raw or "\r" in raw else " ".join(raw.split())
    body = str(body or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    if not subject or len(subject) > MAX_SUBJECT_CHARS:
        raise bad_request("EMAIL_SUBJECT_INVALID", f"The subject must be one line of 1 to {MAX_SUBJECT_CHARS} characters.")
    if not body or len(body) > MAX_BODY_CHARS:
        raise bad_request("EMAIL_BODY_INVALID", f"The message must contain text and stay under {MAX_BODY_CHARS} characters.")
    if draft_has_placeholders(subject) or draft_has_placeholders(body):
        raise bad_request("EMAIL_PLACEHOLDER_UNRESOLVED", "The email still contains a template placeholder such as {{name}}.")
    words = followup_content_word_count(body)
    if words > WORD_CAPS[name]:
        raise bad_request(
            "EMAIL_LENGTH_EXCEEDED",
            f"The {name} draft has {words} content words; the limit is {WORD_CAPS[name]}. Shorten it or use a longer draft.",
        )
    return {"subject": subject, "body": body, "word_count": max(1, words)}


def _require_revision(stored: dict[str, Any], expected_revision: int) -> None:
    if revision_of(stored) != expected_revision:
        raise conflict("EMAIL_DRAFT_CONFLICT", "The email draft was changed in the meantime. Reload it before saving.")


def _carry(stored: dict[str, Any]) -> dict[str, Any]:
    keys = ("status", "selected_length", "lengths", "confirmed_at", "confirmed_revision", "confirmed_by", "source", "review_flags", "attachment_selection", "review", "recipients")
    return {key: stored.get(key) for key in keys}


def update_draft(
    store: Any,
    *,
    opportunity_id: UUID,
    user_id: UUID,
    draft_id: UUID,
    expected_revision: int,
    selected_length: str | None,
    lengths: dict[str, dict[str, Any]] | None,
    attachments: dict[str, bool] | None,
) -> dict[str, Any]:
    """Save edited texts, the chosen length and the attachment selection of one draft revision."""
    stored = store.get_email_draft_by_id(opportunity_id=opportunity_id, user_id=user_id, draft_id=draft_id)
    journey_stage = stored["journey_stage"]
    _require_revision(stored, expected_revision)
    draft = _carry(stored)
    draft["lengths"] = {name: dict(stored["lengths"][name]) for name in LENGTHS}
    changed = False
    for name, text in (lengths or {}).items():
        if name not in LENGTHS:
            raise bad_request("INVALID_EMAIL_LENGTH", "lengths may contain short, medium and extensive only")
        checked = _checked_text(name, text.get("subject"), text.get("body"))
        current = draft["lengths"][name]
        if checked["subject"] != current["subject"] or checked["body"] != str(current["body"]).strip():
            draft["lengths"][name] = {**checked, "edited": True}
            changed = True
    if selected_length is not None and selected_length != draft.get("selected_length"):
        draft["selected_length"] = selected_length
        changed = True
    if attachments is not None:
        master = isinstance(stored.get("source"), dict) and stored["source"].get("kind") == SOURCE_KIND_V2
        if not master and any(attachments.values()):
            raise bad_request("EMAIL_ATTACHMENT_UNAVAILABLE", "This draft has no approved presentation version to attach.")
        selection = {kind: bool(attachments.get(kind, (stored.get("attachment_selection") or {}).get(kind))) for kind in ATTACHMENT_FORMATS} if master else {}
        if selection != (stored.get("attachment_selection") or {}):
            draft["attachment_selection"] = selection
            changed = True
    if not changed:
        return envelope(store, opportunity_id=opportunity_id, user_id=user_id, journey_stage=journey_stage, stored=stored)
    # What was reviewed no longer exists in this form: the confirmation is withdrawn.
    draft.update({"status": "draft", "confirmed_at": None, "confirmed_revision": None, "confirmed_by": None, "review": None, "recipients": None})
    saved = store.save_email_draft(
        opportunity_id=opportunity_id, user_id=user_id, journey_stage=journey_stage, draft=draft, expected_revision=expected_revision
    )
    return envelope(store, opportunity_id=opportunity_id, user_id=user_id, journey_stage=journey_stage, stored=saved)


# ----------------------------------------------------------------------------- confirm


def confirm_draft(
    store: Any,
    *,
    opportunity_id: UUID,
    user_id: UUID,
    draft_id: UUID,
    selected_length: str,
    expected_revision: int | None,
    review_checks: list[str] | None,
    acknowledged_flags: list[str] | None,
) -> dict[str, Any]:
    """Record the owner's review of one saved draft revision. Never sends anything."""
    if selected_length not in LENGTHS:
        raise bad_request("INVALID_EMAIL_LENGTH", "selected_length must be short, medium, or extensive")
    stored = store.get_email_draft_by_id(opportunity_id=opportunity_id, user_id=user_id, draft_id=draft_id)
    journey_stage = stored["journey_stage"]
    opportunity = store.get_opportunity(opportunity_id=opportunity_id, user_id=user_id)
    master = isinstance(stored.get("source"), dict) and stored["source"].get("kind") == SOURCE_KIND_V2
    if expected_revision is None:
        if master:
            raise bad_request("EMAIL_REVISION_REQUIRED", "Name the saved draft revision that was reviewed.")
        expected_revision = revision_of(stored)
    _require_revision(stored, expected_revision)
    review = None
    recipients = _recipients(opportunity.get("followup_statics"))
    if master:
        missing = [check for check in REVIEW_CHECKS if check not in set(review_checks or [])]
        if missing:
            raise bad_request("EMAIL_REVIEW_INCOMPLETE", f"Complete the review checklist first: {', '.join(missing)}.")
        # Each flag has to be acknowledged by name. Nothing is assumed for the owner.
        open_flags = [flag for flag in stored.get("review_flags") or [] if flag not in set(acknowledged_flags or [])]
        if open_flags:
            raise bad_request("EMAIL_REVIEW_FLAGS_OPEN", f"Acknowledge every review flag first: {', '.join(open_flags)}.")
        if source_status(store, stored=stored, opportunity=opportunity, opportunity_id=opportunity_id, user_id=user_id) != "valid":
            raise conflict("FOLLOWUP_SOURCE_CHANGED", "The finalized presentation package changed. Regenerate the email from the current package.")
        require_complete_statics(opportunity.get("followup_statics"))
        text = stored["lengths"][selected_length]
        _checked_text(selected_length, text["subject"], text["body"])
        missing_files = [item["file_name"] for item in attachments_for(store, stored=stored, user_id=user_id) if item["selected"] and not item["available"]]
        if missing_files:
            raise conflict("EMAIL_ATTACHMENT_UNAVAILABLE", f"A selected attachment is not available: {', '.join(missing_files)}.")
        review = {"checks": list(REVIEW_CHECKS), "acknowledged_flags": list(stored.get("review_flags") or [])}
    draft = _carry(stored)
    draft.update(
        {
            "status": "confirmed",
            "selected_length": selected_length,
            "confirmed_at": _now(),
            "confirmed_revision": expected_revision + 1,
            "confirmed_by": str(user_id),
            "review": review,
            "recipients": recipients,
        }
    )
    saved = store.save_email_draft(
        opportunity_id=opportunity_id, user_id=user_id, journey_stage=journey_stage, draft=draft, expected_revision=expected_revision
    )
    return envelope(store, opportunity_id=opportunity_id, user_id=user_id, journey_stage=journey_stage, stored=saved, opportunity=opportunity)


# ----------------------------------------------------------------------------- export


def _address(person: dict[str, Any]) -> str:
    return formataddr((str(person.get("name") or ""), str(person["email"])))


def export_eml(store: Any, *, opportunity_id: UUID, user_id: UUID, draft_id: UUID, revision: int) -> dict[str, Any]:
    """The confirmed draft as an unsent RFC 5322 message with the selected approved files.

    It is a file for the owner's own mail program. No message leaves the application.
    """
    stored = store.get_email_draft_by_id(opportunity_id=opportunity_id, user_id=user_id, draft_id=draft_id)
    opportunity = store.get_opportunity(opportunity_id=opportunity_id, user_id=user_id)
    if stored.get("status") != "confirmed" or not stored.get("selected_length"):
        raise conflict("EMAIL_NOT_CONFIRMED", "Review and confirm the saved draft before exporting it.")
    current = revision_of(stored)
    confirmed_revision = stored.get("confirmed_revision") or current
    if revision != current or confirmed_revision != current:
        raise conflict("EMAIL_EXPORT_STALE", "The draft changed after it was confirmed. Review and confirm it again.")
    if source_status(store, stored=stored, opportunity=opportunity, opportunity_id=opportunity_id, user_id=user_id) == "changed":
        raise conflict("FOLLOWUP_SOURCE_CHANGED", "The finalized presentation package changed. Regenerate the email from the current package.")
    recipients = stored.get("recipients") or _recipients(opportunity.get("followup_statics"))
    if not recipients:
        raise bad_request("FOLLOWUP_STATICS_REQUIRED", "Recipient and sender are required to export the email.")
    text = stored["lengths"][stored["selected_length"]]
    sender = recipients["sender"]
    message = EmailMessage(policy=SMTP)
    message["From"] = _address(sender)
    message["To"] = ", ".join(_address(person) for person in recipients["to"])
    if recipients.get("cc"):
        message["Cc"] = ", ".join(_address(person) for person in recipients["cc"])
    message["Subject"] = text["subject"]
    message["Date"] = format_datetime(datetime.now(UTC))
    message["Message-ID"] = make_msgid(domain=str(sender["email"]).rpartition("@")[2] or "localhost")
    # Mail programs open a message marked like this as a draft to be sent by the user.
    message["X-Unsent"] = "1"
    message["X-Borek-Draft-Id"] = str(stored["id"])
    message["X-Borek-Draft-Revision"] = str(current)
    message.set_content(str(text["body"]) + "\n", subtype="plain", charset="utf-8", cte="quoted-printable")
    attached = []
    for item in attachments_for(store, stored=stored, user_id=user_id):
        if not item["selected"]:
            continue
        if not item["available"]:
            raise conflict("EMAIL_ATTACHMENT_UNAVAILABLE", f"A selected attachment is not available: {item['file_name']}.")
        data = item["_path"].read_bytes()
        maintype, subtype = MEDIA_TYPES[item["format"]]
        message.add_attachment(data, maintype=maintype, subtype=subtype, filename=item["file_name"])
        attached.append(
            {
                "format": item["format"],
                "file_name": item["file_name"],
                "size_bytes": len(data),
                "sha256": hashlib.sha256(data).hexdigest(),
                "presentation_version_id": item["presentation_version_id"],
            }
        )
    if attached:
        message["X-Borek-Presentation-Version-Id"] = attached[0]["presentation_version_id"]
    project = str((opportunity.get("followup_statics") or {}).get("project_name") or "follow-up")
    return {
        "file_name": f"{_safe_name(project)} - follow-up email.eml",
        "content": message.as_bytes(),
        "revision": current,
        "attachments": attached,
    }

"""AI-assisted follow-up email writer with a grounding gate.

The rule-based writer (``finalized.py``) strings confirmed statements together. This module asks
the configured model to write the same material as a natural business email, and accepts the
result only if every sentence is shown to rest on the confirmed findings:

    facts          the confirmed meeting findings of the finalized package, each with an id that
                   says what it is: R requirement, C challenge, P priority, D decision,
                   S discussed solution, O opportunity, N next step. Nothing else is sent to the
                   model - no transcript, no speaker turns, no personal notes, no recipient or
                   sender. Greeting, attachment sentence and signature are added by code.
    writer         returns, per length, paragraphs of sentences; every sentence names the fact
                   ids it rests on.
    rule checks    deterministic: cited ids exist and fit the paragraph; numbers, dates, names,
                   commitments and decision words occur in the cited facts; no attribution to the
                   client, no attachment claim, no greeting or signature, the word limit holds.
    verifier       a second, independent model call judges sentence by sentence whether the
                   cited facts support it and whether a suggestion became a commitment.

One rejected draft is returned to the writer with the findings of the checks; a second rejection
ends the attempt. The caller then uses the rule-based writer and records why.

Pure with respect to storage: it reads its arguments and calls the two completion functions.
"""

from __future__ import annotations

import copy
import re
from collections.abc import Callable
from pathlib import Path
from typing import Any

import jsonschema

from services.followup.finalized import (
    ATTACHMENT_SENTENCE,
    DISCUSSED_CATEGORIES,
    HEARD_CATEGORIES,
    LENGTHS,
    SHORT_ATTACHMENT_SENTENCE,
    WORD_CAPS,
    known_names,
    signature,
)
from services.followup.rendering import followup_content_word_count, greeting

WRITER_PROMPT_VERSION = "followup-email-writer:v1"
VERIFIER_PROMPT_VERSION = "followup-email-verifier:v1"
STAGE_WRITER = "followup_email_writer"
STAGE_VERIFIER = "followup_email_verifier"
MAX_ATTEMPTS = 2
MIN_CONTENT_WORDS = 25

_PROMPTS = Path(__file__).resolve().parents[2] / "llm" / "claude" / "prompts"
WRITER_PROMPT_PATH = _PROMPTS / "followup_email_writer_v1.txt"
VERIFIER_PROMPT_PATH = _PROMPTS / "followup_email_verifier_v1.txt"

Complete = Callable[[str, str, dict[str, Any]], dict[str, Any]]

FACT_PREFIX = {
    "requirements": "R", "challenges": "C", "priorities": "P", "decisions": "D",
    "discussed_solutions": "S", "opportunities": "O", "follow_ups": "N",
}
FACT_LABEL = {
    "R": "requirement", "C": "challenge", "P": "priority", "D": "decision noted in the meeting",
    "S": "solution that was discussed, not decided", "O": "opportunity that was mentioned, not decided", "N": "next step",
}
PARAGRAPH_KINDS = ("opening", "context", "contribution", "next_steps", "closing")
_RANK = {"opening": 0, "context": 1, "contribution": 1, "next_steps": 2, "closing": 3}
# Which facts a paragraph may rest on. A decision is never part of BOREK's contribution, and a
# discussed idea is never part of what was decided or of the next steps.
ALLOWED_FACTS = {
    "opening": "RCP",
    "context": "RCPD",
    "contribution": "SORCP",
    "next_steps": "ND",
    "closing": "",
}


class AiWriterRejected(ValueError):
    """The model's draft did not pass a check. ``issues`` say which sentence and why."""

    def __init__(self, code: str, message: str, issues: list[dict[str, Any]] | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.issues = list(issues or [])


# ----------------------------------------------------------------------------- facts


def facts_from_content(content: dict[str, Any]) -> list[dict[str, str]]:
    """The confirmed statements an email may rest on, each with an id that names its kind."""
    groups: dict[str, list[str]] = {name: list(content["by_category"].get(name) or []) for name in (*HEARD_CATEGORIES, *DISCUSSED_CATEGORIES)}
    groups["decisions"] = list(content["decisions"])
    groups["follow_ups"] = list(content["actions"])
    facts: list[dict[str, str]] = []
    seen: set[str] = set()
    for category in ("requirements", "challenges", "priorities", "decisions", "discussed_solutions", "opportunities", "follow_ups"):
        number = 0
        for text in groups[category]:
            text = " ".join(str(text).split())
            if not text or (category != "follow_ups" and text in seen):
                continue
            seen.add(text)
            number += 1
            facts.append({"id": f"{FACT_PREFIX[category]}{number}", "kind": FACT_PREFIX[category], "text": text})
    return facts


def writer_schema(lengths: tuple[str, ...] = LENGTHS) -> dict[str, Any]:
    sentence = {
        "type": "object",
        "additionalProperties": False,
        "required": ["text", "fact_ids"],
        "properties": {"text": {"type": "string", "minLength": 1}, "fact_ids": {"type": "array", "items": {"type": "string"}}},
    }
    paragraph = {
        "type": "object",
        "additionalProperties": False,
        "required": ["kind", "sentences"],
        "properties": {"kind": {"type": "string", "enum": list(PARAGRAPH_KINDS)}, "sentences": {"type": "array", "minItems": 1, "items": sentence}},
    }
    length = {
        "type": "object",
        "additionalProperties": False,
        "required": ["paragraphs"],
        "properties": {"paragraphs": {"type": "array", "minItems": 2, "items": paragraph}},
    }
    return {"type": "object", "additionalProperties": False, "required": list(lengths), "properties": dict.fromkeys(lengths, length)}


def verifier_schema(lengths: tuple[str, ...] = LENGTHS) -> dict[str, Any]:
    verdict = {
        "type": "object",
        "additionalProperties": False,
        "required": ["length", "index", "supported", "issue"],
        "properties": {
            "length": {"type": "string", "enum": list(lengths)},
            "index": {"type": "integer", "minimum": 1},
            "supported": {"type": "boolean"},
            "issue": {"type": "string"},
        },
    }
    return {"type": "object", "additionalProperties": False, "required": ["verdicts"], "properties": {"verdicts": {"type": "array", "items": verdict}}}


def writer_message(
    facts: list[dict[str, str]], statics: dict[str, Any], feedback: list[dict[str, Any]] | None = None, lengths: tuple[str, ...] = LENGTHS
) -> str:
    client = " ".join(str(statics.get("client_short") or "").split())
    lines = [
        f"CLIENT: {client or '(not named - do not name the client)'}",
        f"PROJECT: {' '.join(str(statics.get('project_name') or '').split())}",
        "LENGTHS TO WRITE: " + ", ".join(lengths),
        "WORD LIMITS (content words, without greeting and signature): " + ", ".join(f"{name} {WORD_CAPS[name] - 20}" for name in lengths),
        "",
        "CONFIRMED FACTS (the only source of factual content):",
        *[f"{fact['id']} [{FACT_LABEL[fact['kind']]}] {fact['text']}" for fact in facts],
    ]
    if feedback:
        lines += ["", "YOUR PREVIOUS DRAFT WAS REJECTED. Fix every point and return every requested length again:"]
        lines += [f"- {item.get('length', '')} | {item.get('code', '')} | {item.get('sentence', '')} | {item.get('detail', '')}" for item in feedback[:40]]
    return "\n".join(lines)


def verifier_message(facts: list[dict[str, str]], sentences: list[dict[str, Any]]) -> str:
    lines = ["CONFIRMED FACTS:", *[f"{fact['id']} [{FACT_LABEL[fact['kind']]}] {fact['text']}" for fact in facts], "", "SENTENCES TO JUDGE:"]
    for item in sentences:
        cited = ", ".join(item["fact_ids"]) or "none (courtesy sentence: it must state no fact about the client or the meeting)"
        lines.append(f"{item['length']} #{item['index']} [{item['kind']}] cites {cited}: {item['text']}")
    return "\n".join(lines)


# ----------------------------------------------------------------------------- rule checks

_NUMBER_WORDS = frozenset(
    "two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty "
    "sixty seventy eighty ninety hundred thousand million billion dozen couple several half quarter double twice triple".split()
)
_TIME_WORDS = frozenset(
    "monday tuesday wednesday thursday friday saturday sunday january february march april june july august september october november december "
    "today tomorrow yesterday tonight morning afternoon evening weekend deadline".split()
)
_TIME_PHRASES = re.compile(
    r"\b(?:next|last|this|coming|following|end of(?: the)?|by the end of|within|in)\s+(?:\w+\s+)?(?:week|weeks|month|months|quarter|year|days?|fortnight)\b|\bq[1-4]\b|\bmay \d",
    re.IGNORECASE,
)
_COMMITMENT = re.compile(r"\b(?:will|shall|won't|we'll|i'll|commit\w*|guarantee\w*|promis\w*|ensure\w*|pledge\w*|undertake\w*)\b", re.IGNORECASE)
_AGREEMENT = re.compile(r"\b(?:agree\w*|decided|decision\w*|confirmed|committed|signed|approved|settled|finali[sz]ed|go-ahead|green light)\b", re.IGNORECASE)
# "None of this is decided yet", "not agreed", "to be confirmed": the opposite of a claim.
_NEGATION = re.compile(r"\b(?:not|no|none|nothing|never|neither|nor|without|yet to be|still to be|to be|before (?:any|a))\b|n't\b", re.IGNORECASE)


def _is_negated(text: str, start: int) -> bool:
    """A negation earlier in the same clause, at most a few words before the word itself."""
    clause = re.split(r"[,;:.!?]", text[:start])[-1]
    return bool(_NEGATION.search(clause[-45:]))


_ATTRIBUTION = re.compile(
    r"\b(?:you (?:said|told|asked|mentioned|confirmed|agreed|want\w*|need\w*|require\w*|explained|described|raised|stressed|emphasi[sz]ed)|"
    r"your (?:requirement|priorit|challenge|decision|concern|team told)\w*|as you |good to hear|we heard|as promised|as agreed|as discussed with)",
    re.IGNORECASE,
)
_ATTACHMENT = re.compile(r"\b(?:attach\w*|enclos\w*)\b", re.IGNORECASE)
_SALUTATION = re.compile(r"^(?:dear|hi|hello)\b|\b(?:best|kind|warm) regards\b|\bsincerely\b|\byours\b", re.IGNORECASE)
_FORMAT = re.compile(r"\{\{|\*\*|^#|https?://|www\.|\S+@\S+\.\S+|\[[^\]]*\]\(|\n")
_CAPITALISED = re.compile(r"\b[A-Z][A-Za-z]*(?:[-'][A-Za-z]+)*\b")
_ALLOWED_CAPITALS = frozenset({"I", "BOREK", "Borek"})


def _words(text: str) -> list[str]:
    return re.findall(r"[a-z]+", text.lower())


def _numbers(text: str) -> list[str]:
    return [re.sub(r"[.,](?=\d{3}\b)", "", item) for item in re.findall(r"\d+(?:[.,]\d+)*", text)]


def _sentence_issues(sentence: dict[str, Any], kind: str, facts: dict[str, dict[str, str]], names: frozenset[str], client: frozenset[str]) -> list[tuple[str, str]]:
    text = " ".join(str(sentence.get("text") or "").split())
    ids = [str(item) for item in sentence.get("fact_ids") or []]
    issues: list[tuple[str, str]] = []
    unknown = [item for item in ids if item not in facts]
    if unknown:
        return [("UNKNOWN_FACT", f"cited fact does not exist: {', '.join(unknown)}")]
    wrong = [item for item in ids if facts[item]["kind"] not in ALLOWED_FACTS[kind]]
    if wrong:
        issues.append(("WRONG_KIND", f"a {kind} paragraph cannot rest on {', '.join(wrong)}: {FACT_LABEL[facts[wrong[0]]['kind']]}"))
    if not ids and kind in ("context", "next_steps"):
        issues.append(("UNCITED_CLAIM", f"every sentence of a {kind} paragraph must name the facts it rests on"))
    cited = " ".join(facts[item]["text"] for item in ids)
    cited_words, cited_lower = set(_words(cited)), cited.lower()
    if not text.endswith((".", "?", "!")) or _FORMAT.search(text):
        issues.append(("FORMAT", "one plain sentence: no line break, markup, link or address"))
    if _SALUTATION.search(text):
        issues.append(("FORMAT", "greeting and signature are added automatically"))
    if _ATTACHMENT.search(text):
        issues.append(("ATTACHMENT", "do not mention attachments: that sentence is added only when a file is selected"))
    if _ATTRIBUTION.search(text):
        issues.append(("ATTRIBUTION", "the findings do not record who said what: do not say the client said, wanted or promised something"))
    for number in _numbers(text):
        if number not in _numbers(cited):
            issues.append(("NUMBER", f"'{number}' is not in the cited facts"))
    for word in _words(text):
        if word in _NUMBER_WORDS and word not in cited_words:
            issues.append(("NUMBER", f"quantity '{word}' is not in the cited facts"))
        if word in _TIME_WORDS and word not in cited_words:
            issues.append(("DATE", f"'{word}' is not in the cited facts"))
    for phrase in _TIME_PHRASES.findall(text):
        if phrase.lower() not in cited_lower:
            issues.append(("DATE", f"time reference '{phrase}' is not in the cited facts"))
    for match in _COMMITMENT.finditer(text):
        if match.group(0).lower() not in cited_words and match.group(0).lower() not in cited_lower:
            issues.append(("COMMITMENT", f"'{match.group(0)}' states a commitment the cited facts do not contain"))
    for match in _AGREEMENT.finditer(text):
        if match.group(0).lower() not in cited_lower and not _is_negated(text, match.start()):
            issues.append(("AGREEMENT", f"'{match.group(0)}' presents something as agreed or decided; the cited facts do not"))
    tokens = list(_CAPITALISED.finditer(text))
    for position, match in enumerate(tokens):
        token = match.group(0)
        base = token.split("'")[0]
        following = tokens[position + 1].start() == match.end() + 1 if position + 1 < len(tokens) else False
        # The first word of a sentence is capitalised anyway; it is a name only if it is one
        # elsewhere in the findings or leads a run of capitalised words ("Markus Thiel").
        if match.start() == 0 and base not in names and not following:
            continue
        if base in _ALLOWED_CAPITALS or base in client or re.search(rf"\b{re.escape(base)}\b", cited):
            continue
        issues.append(("NAME", f"'{token}' is a name or term the cited facts do not contain"))
    return issues


def check_drafts(
    drafts: dict[str, Any], facts: list[dict[str, str]], statics: dict[str, Any], lengths: tuple[str, ...] = LENGTHS
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Deterministic checks of the written lengths. Returns (issues, numbered sentences)."""
    by_id = {fact["id"]: fact for fact in facts}
    names = known_names([fact["text"] for fact in facts], {})
    client = frozenset(re.findall(r"[A-Za-z]+", str(statics.get("client_short") or "")))
    has_steps = any(fact["kind"] == "N" for fact in facts)
    issues: list[dict[str, Any]] = []
    sentences: list[dict[str, Any]] = []

    def add(length: str, code: str, detail: str, sentence: str = "") -> None:
        issues.append({"length": length, "code": code, "sentence": sentence, "detail": detail})

    for name in lengths:
        paragraphs = drafts[name]["paragraphs"]
        kinds = [paragraph["kind"] for paragraph in paragraphs]
        if kinds[0] != "opening" or kinds[-1] != "closing" or kinds.count("opening") != 1 or kinds.count("closing") != 1:
            add(name, "STRUCTURE", "start with one opening paragraph and end with one closing paragraph")
        if [_RANK[kind] for kind in kinds] != sorted(_RANK[kind] for kind in kinds):
            add(name, "STRUCTURE", "order: opening, context and contribution, next steps, closing")
        cited_here: set[str] = set()
        index = 0
        for paragraph in paragraphs:
            for sentence in paragraph["sentences"]:
                index += 1
                text = " ".join(str(sentence.get("text") or "").split())
                ids = [str(item) for item in sentence.get("fact_ids") or []]
                cited_here.update(ids)
                sentences.append({"length": name, "index": index, "kind": paragraph["kind"], "text": text, "fact_ids": ids})
                for code, detail in _sentence_issues(sentence, paragraph["kind"], by_id, names, client):
                    add(name, code, detail, text)
        if not cited_here:
            add(name, "STRUCTURE", "the email reports none of the confirmed facts")
        if has_steps and not any(by_id[item]["kind"] == "N" for item in cited_here if item in by_id):
            add(name, "STRUCTURE", "confirmed next steps exist: name at least one in a next_steps paragraph")
        words = followup_content_word_count(assemble(drafts[name], statics, length=name, attachment=True))
        if words > WORD_CAPS[name]:
            add(name, "LENGTH", f"{words} content words with the attachment sentence; the limit is {WORD_CAPS[name]}")
        if words < MIN_CONTENT_WORDS:
            add(name, "LENGTH", f"only {words} content words")
    return issues, sentences


# ----------------------------------------------------------------------------- assembly


def assemble(draft: dict[str, Any], statics: dict[str, Any], *, length: str, attachment: bool) -> str:
    """The email text: greeting and signature from the owner's details, the model's paragraphs
    between them, and the fixed attachment sentence only when a file is selected."""
    paragraphs = [(item["kind"], " ".join(" ".join(str(sentence["text"]).split()) for sentence in item["sentences"])) for item in draft["paragraphs"]]
    if attachment:
        sentence = SHORT_ATTACHMENT_SENTENCE if length == "short" else ATTACHMENT_SENTENCE
        position = next((index for index, (kind, _text) in enumerate(paragraphs) if kind in ("next_steps", "closing")), len(paragraphs))
        paragraphs.insert(position, ("attachment", sentence))
    return "\n\n".join([greeting(statics), *[text for _kind, text in paragraphs], signature(statics)])


# ----------------------------------------------------------------------------- pipeline


def write_with_ai(
    content: dict[str, Any],
    statics: dict[str, Any],
    *,
    writer: Complete,
    verifier: Complete,
    lengths: tuple[str, ...] = LENGTHS,
    max_attempts: int = MAX_ATTEMPTS,
) -> dict[str, Any]:
    """Verified drafts, or ``AiWriterRejected``. Both variants (with and without the attachment
    sentence) are returned, so a later change of the selection needs no new call.

    The application writes all three lengths with one correction. ``lengths`` and
    ``max_attempts`` narrow that for a check that should cost as little as possible.
    """
    facts = facts_from_content(content)
    if not facts:
        raise AiWriterRejected("AI_NO_FACTS", "There is no confirmed fact to write from.")
    system_writer = WRITER_PROMPT_PATH.read_text(encoding="utf-8")
    system_verifier = VERIFIER_PROMPT_PATH.read_text(encoding="utf-8")
    feedback: list[dict[str, Any]] | None = None
    last: tuple[str, str, list[dict[str, Any]]] = ("AI_OUTPUT_INVALID", "The AI writer returned no usable draft.", [])
    for attempt in range(1, max(1, max_attempts) + 1):
        raw = writer(system_writer, writer_message(facts, statics, feedback, lengths), writer_schema(lengths))
        try:
            jsonschema.Draft202012Validator(writer_schema(lengths)).validate(raw)
        except jsonschema.ValidationError as exc:
            last = ("AI_OUTPUT_INVALID", "The AI writer did not return the drafts in the expected form.", [{"length": "", "code": "SCHEMA", "sentence": "", "detail": exc.message[:200]}])
            feedback = last[2]
            continue
        drafts = copy.deepcopy(raw)
        issues, sentences = check_drafts(drafts, facts, statics, lengths)
        if issues:
            last = ("AI_GROUNDING_REJECTED", f"The AI draft failed {len(issues)} grounding or format {'check' if len(issues) == 1 else 'checks'}.", issues)
            feedback = issues
            continue
        verdicts = verifier(system_verifier, verifier_message(facts, sentences), verifier_schema(lengths))
        try:
            jsonschema.Draft202012Validator(verifier_schema(lengths)).validate(verdicts)
        except jsonschema.ValidationError as exc:
            raise AiWriterRejected("AI_VERIFIER_INVALID", "The grounding verifier did not return a verdict for the draft.") from exc
        judged = {(item["length"], int(item["index"])): item for item in verdicts["verdicts"]}
        unsupported = []
        for item in sentences:
            verdict = judged.get((item["length"], item["index"]))
            if verdict is None:
                unsupported.append({"length": item["length"], "code": "UNVERIFIED", "sentence": item["text"], "detail": "the verifier returned no verdict for this sentence"})
            elif not verdict["supported"]:
                unsupported.append({"length": item["length"], "code": "UNSUPPORTED", "sentence": item["text"], "detail": str(verdict.get("issue") or "not supported by the cited facts")[:300]})
        if unsupported:
            last = ("AI_GROUNDING_REJECTED", f"The grounding verifier did not accept {len(unsupported)} {'sentence' if len(unsupported) == 1 else 'sentences'}.", unsupported)
            feedback = unsupported
            continue
        return {
            "variants": {
                variant: {name: assemble(drafts[name], statics, length=name, attachment=attached) for name in lengths}
                for variant, attached in (("attached", True), ("plain", False))
            },
            "verification": {
                "attempts": attempt,
                "fact_count": len(facts),
                "sentence_count": len(sentences),
                "cited_fact_ids": sorted({fact_id for item in sentences for fact_id in item["fact_ids"]}),
                "sentences": sentences,
            },
        }
    raise AiWriterRejected(*last)

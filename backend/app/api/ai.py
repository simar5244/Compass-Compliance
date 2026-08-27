"""Authenticated, streaming AI help for individual audit findings."""

from __future__ import annotations

import json
import uuid
from collections.abc import AsyncIterator
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from openai import AsyncOpenAI
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.audit.check_catalog import CHECK_CATALOG
from app.auth.deps import get_current_user
from app.config import settings
from app.db import async_session
from app.models import Issue, Page, Scan, User
from app.ratelimit import UserRateLimiter

router = APIRouter(prefix="/api/ai", tags=["ai"])
_rate_limiter = UserRateLimiter(max_requests=10, window_seconds=60)
_instant_rate_limiter = UserRateLimiter(max_requests=10, window_seconds=60)
_catalog = {entry.rule_id: entry for entry in CHECK_CATALOG}


class ChatMessage(BaseModel):
    role: str
    content: str = Field(min_length=1, max_length=8000)


AILevel = Literal["non_technical", "moderately_technical", "highly_technical"]

# How much implementation detail the answer should carry, chosen by the reader.
_LEVEL_GUIDANCE: dict[str, str] = {
    "non_technical": (
        "Write for a content editor with no coding background. Avoid jargon and code; "
        "describe the fix as steps they could take in a CMS or hand to a developer."
    ),
    "moderately_technical": (
        "Write for a competent web author. Use plain language first, then show a short, "
        "concrete code example."
    ),
    "highly_technical": (
        "Write for an experienced front-end engineer. Be precise about the DOM, ARIA "
        "semantics, and assistive-technology behaviour, and include complete code."
    ),
}


class IssueExplainRequest(BaseModel):
    issue_id: uuid.UUID
    messages: list[ChatMessage] = Field(min_length=1, max_length=20)
    level: AILevel = "moderately_technical"


class InstantIssueExplainRequest(IssueExplainRequest):
    report_slug: str = Field(min_length=8, max_length=64)


def _snippet_text(snippet: str | None) -> str:
    if not snippet:
        return "N/A"
    try:
        parsed = json.loads(snippet)
        if isinstance(parsed, dict):
            if parsed.get("matched_text"):
                return f'Matched word: {parsed.get("matched_text")}\nContext: {parsed.get("context") or "N/A"}'
            return str(parsed.get("error_text") or parsed.get("html_snippet") or snippet)
    except (TypeError, ValueError):
        pass
    return snippet


def _system_prompt(issue: Issue, page_url: str, level: str = "moderately_technical") -> str:
    check = _catalog.get(issue.rule_id)
    display_name = check.display_name if check else issue.rule_id
    criterion = check.wcag_criterion if check else issue.criterion_id
    sensitive_instruction = """
For this Sensitive Keywords occurrence, organize the first answer under exactly these headings:
1. Summary
2. Why it was flagged
3. How to decide what to do
4. Recommended changes
Explain that a keyword match is a review prompt, not automatically an error. Use the matched word and its surrounding context.
""" if issue.rule_id == "sensitive_keywords" else ""
    return f"""You are an expert web accessibility and quality consultant embedded in a website auditing platform. A user is looking at a specific issue found on their website and needs help understanding and fixing it.

Issue details:
- Check: {display_name} ({issue.rule_id})
- WCAG criterion: {criterion or "N/A"}
- Severity: {issue.impact or "info"}
- Page URL: {page_url}
- Affected element: {issue.selector or "page-level issue"}
- HTML snippet: {_snippet_text(issue.html_snippet)}
- Category: {issue.category} / {issue.subcategory or "N/A"}

Your job:
1. Explain what this issue means in plain English (1-2 sentences)
2. Explain WHY it matters — impact on users with disabilities, SEO, or compliance risk
3. Show exactly how to fix it with a specific code example based on the HTML snippet above
4. If the user asks follow-up questions, answer them in context of this specific issue

Audience level: {_LEVEL_GUIDANCE.get(level, _LEVEL_GUIDANCE["moderately_technical"])}

Keep responses concise and practical. Format code in markdown code blocks.
Always tailor advice to the specific HTML shown, not generic examples.
Never make up WCAG criteria that don't exist.
{sensitive_instruction}"""


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _validate_messages(messages: list[ChatMessage]) -> None:
    if any(message.role not in {"user", "assistant"} for message in messages):
        raise HTTPException(422, "Invalid message role")
    if len(messages) > 20:
        raise HTTPException(422, "Conversation is limited to 10 turns")


def _stream_ai_response(
    issue: Issue, page_url: str, chat_messages: list[ChatMessage],
    level: str = "moderately_technical",
) -> StreamingResponse:
    if not settings.openai_api_key:
        raise HTTPException(503, "AI is not configured")
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    messages = [{"role": "system", "content": _system_prompt(issue, page_url, level)}]
    messages.extend({"role": message.role, "content": message.content} for message in chat_messages)

    async def stream() -> AsyncIterator[str]:
        try:
            completion = await client.chat.completions.create(
                model=settings.openai_model, messages=messages, stream=True,
            )
            async for chunk in completion:
                delta = chunk.choices[0].delta.content if chunk.choices else None
                if delta:
                    yield _sse({"token": delta})
            yield _sse({"done": True})
        except Exception:
            yield _sse({"error": "Couldn't connect to AI — try again"})
        finally:
            await client.close()

    return StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/issue-explain")
async def explain_issue(
    payload: IssueExplainRequest,
    request: Request,
    response: Response,
    user: User = Depends(get_current_user),
) -> StreamingResponse:
    if not _rate_limiter.allow(str(user.id)):
        response.headers["Retry-After"] = str(_rate_limiter.retry_after(str(user.id)))
        raise HTTPException(429, "AI rate limit reached. Try again shortly.")
    _validate_messages(payload.messages)

    async with async_session() as session:
        row = (await session.execute(
            select(Issue, Page.url).join(Page, Issue.page_id == Page.id).where(Issue.id == payload.issue_id)
        )).first()
    if row is None:
        raise HTTPException(404, "Issue not found")
    issue, page_url = row
    return _stream_ai_response(issue, page_url, payload.messages, payload.level)


@router.post("/instant-issue-explain")
async def explain_instant_issue(payload: InstantIssueExplainRequest, request: Request, response: Response) -> StreamingResponse:
    """AI help for an issue in an unguessable public instant-report slug."""
    key = request.client.host if request.client else "unknown"
    if not _instant_rate_limiter.allow(key):
        response.headers["Retry-After"] = str(_instant_rate_limiter.retry_after(key))
        raise HTTPException(429, "AI rate limit reached. Try again shortly.")
    _validate_messages(payload.messages)
    async with async_session() as session:
        row = (await session.execute(
            select(Issue, Page.url)
            .join(Page, Issue.page_id == Page.id)
            .join(Scan, Page.scan_id == Scan.id)
            .where(
                Issue.id == payload.issue_id,
                Scan.report_slug == payload.report_slug,
                Scan.is_instant.is_(True),
            )
        )).first()
    if row is None:
        raise HTTPException(404, "Issue not found in this report")
    issue, page_url = row
    # Available for every check in a report. The slug is unguessable and the
    # per-IP rate limit above still applies.
    return _stream_ai_response(issue, page_url, payload.messages, payload.level)

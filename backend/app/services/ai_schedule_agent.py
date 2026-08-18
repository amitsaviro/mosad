# The AI scheduling agent: given a layer's recurring weekly meeting
# days, a free-text description of the group's "character", and the
# nationwide activity repository's ratings/usage history, proposes a
# draft session-by-session schedule for a date range.
#
# Built as a small LangGraph agent on top of Claude:
#   generate -> validate -> (retry on problems, up to a cap) -> finalize
# A heuristic ranking underneath both grounds the LLM's choices (it
# only ever picks from a pre-scored shortlist, never the raw
# repository) and acts as the safety net: if no API key is configured,
# or the call fails, or the LLM's own output is unusable, the endpoint
# still returns a complete, valid draft built from the heuristic alone.
import uuid
from datetime import date as date_type
from datetime import timedelta
from typing import TypedDict

from sqlalchemy.orm import Session

from app.config import settings
from app.models.activity import Activity
from app.models.activity_rating import ActivityRating
from app.models.calendar_activity import CalendarActivity
from app.models.layer import Layer
from app.models.layer_schedule_profile import LayerScheduleProfile
from app.schemas.ai_schedule import AiScheduleResponse, AiScheduleSuggestion
from app.services.activity_service import average_rating

RECENT_USE_WINDOW_DAYS = 21
MAX_LLM_ATTEMPTS = 2
CANDIDATE_POOL_SIZE = 20

# Python's date.weekday(): Monday=0 ... Sunday=6. This app (and the
# rest of the schema) uses the Israeli, Sunday-first convention.
_PY_WEEKDAY_TO_NAME = {
    6: "sunday",
    0: "monday",
    1: "tuesday",
    2: "wednesday",
    3: "thursday",
    4: "friday",
    5: "saturday",
}


def _weekday_name(d: date_type) -> str:
    return _PY_WEEKDAY_TO_NAME[d.weekday()]


def _meeting_dates(start: date_type, end: date_type, meeting_days: set[str]) -> list[date_type]:
    dates = []
    cur = start
    while cur <= end:
        if _weekday_name(cur) in meeting_days:
            dates.append(cur)
        cur += timedelta(days=1)
    return dates


def _holiday_dates(start: date_type, end: date_type) -> set[date_type]:
    from app.services.holiday_service import list_israeli_holidays

    result: set[date_type] = set()
    for h in list_israeli_holidays(start, end):
        cur = h.start_date
        while cur <= h.end_date:
            result.add(cur)
            cur += timedelta(days=1)
    return result


def _layer_ratings_by_activity(db: Session, layer_id: uuid.UUID) -> dict[uuid.UUID, float]:
    rows = db.query(ActivityRating).filter(ActivityRating.layer_id == layer_id).all()
    by_activity: dict[uuid.UUID, list[int]] = {}
    for r in rows:
        by_activity.setdefault(r.activity_id, []).append(r.rating)
    return {aid: sum(v) / len(v) for aid, v in by_activity.items()}


def _recent_activity_ids(db: Session, layer_id: uuid.UUID, before: date_type) -> set[uuid.UUID]:
    cutoff = before - timedelta(days=RECENT_USE_WINDOW_DAYS)
    rows = (
        db.query(CalendarActivity.activity_id)
        .filter(CalendarActivity.layer_id == layer_id, CalendarActivity.date >= cutoff, CalendarActivity.date < before)
        .all()
    )
    return {r[0] for r in rows}


def _character_keywords(text: str | None) -> list[str]:
    if not text:
        return []
    # Crude split on whitespace/commas -- enough to catch obvious
    # matches like "תוססת" or "תחרויות" against an activity's own
    # name/description/tags/categories.
    raw = text.replace(",", " ").split()
    return [w.strip() for w in raw if len(w.strip()) >= 2]


def _score_candidates(
    activities: list[Activity],
    recent_ids: set[uuid.UUID],
    layer_ratings: dict[uuid.UUID, float],
    keywords: list[str],
) -> list[dict]:
    scored = []
    for a in activities:
        if a.activity_type != "main":
            continue
        layer_rating = layer_ratings.get(a.id)
        repo_rating = average_rating(a)
        base = layer_rating if layer_rating is not None else (repo_rating or 3.0)
        score = base
        reasons = []
        if layer_rating is not None:
            reasons.append(f"השכבה שלכם דירגה פעילות זו {layer_rating:.1f}/5 בעבר")
        elif repo_rating:
            reasons.append(f"מדורגת {repo_rating:.1f}/5 במאגר הארצי")
        text = " ".join([a.name, a.description, " ".join(a.tags), " ".join(a.categories)])
        if any(kw in text for kw in keywords):
            score += 1.0
            reasons.append("מתאימה לאופי השכבה שהוגדר")
        if a.id in recent_ids:
            score -= 2.0
            reasons.append(f"נעשתה כבר בשכבה ב-{RECENT_USE_WINDOW_DAYS} הימים האחרונים")
        scored.append({"activity": a, "score": score, "reasons": reasons})
    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored


def _heuristic_items(usable_dates: list[date_type], candidates: list[dict]) -> list[dict]:
    """Round-robins through the scored candidate pool, best first,
    cycling back to the top once exhausted rather than ever leaving a
    meeting date unfilled."""
    items = []
    for i, d in enumerate(usable_dates):
        choice = candidates[i % len(candidates)]
        items.append(
            {
                "date": d.isoformat(),
                "activity_id": choice["id"],
                "reason": ", ".join(choice["reasons"]) or "הפעילות המדורגת ביותר הזמינה",
            }
        )
    return items


class _AgentState(TypedDict):
    layer_name: str
    group_character: str | None
    meeting_dates: list[str]
    candidates: list[dict]
    attempt: int
    feedback: str | None
    items: list[dict]
    errors: list[str]


def _generate_node(state: _AgentState) -> _AgentState:
    from langchain_anthropic import ChatAnthropic
    from pydantic import BaseModel, Field

    class _LlmItem(BaseModel):
        date: str = Field(description="One of the given meeting dates, YYYY-MM-DD.")
        activity_id: str = Field(description="One of the given candidate activity ids, verbatim.")
        reason: str = Field(description="Short, one-sentence reason in Hebrew for this pick.")

    class _LlmOutput(BaseModel):
        items: list[_LlmItem]

    model = ChatAnthropic(
        model="claude-sonnet-5", api_key=settings.anthropic_api_key, temperature=0.4
    ).with_structured_output(_LlmOutput)

    candidates_text = "\n".join(
        f"- id={c['id']} | {c['name']} | ציון: {c['score']:.1f} | {', '.join(c['reasons']) or 'ללא הערות מיוחדות'}"
        for c in state["candidates"]
    )
    dates_text = ", ".join(state["meeting_dates"])
    character_text = state["group_character"] or "לא צוין"

    prompt = f"""בונים לו״ז שבועי לשכבה "{state['layer_name']}" בתנועת נוער.
אופי הקבוצה: {character_text}
תאריכי המפגשים שיש למלא (חובה למלא את כולם, כל תאריך פעם אחת בדיוק): {dates_text}

רשימת פעילויות מועמדות -- בחרו אך ורק מתוכן, לפי ה-id המדויק:
{candidates_text}

בחרו פעילות אחת לכל תאריך מפגש. העדיפו פעילויות עם ציון גבוה יותר, אך השתדלו לגוון ולא לחזור על אותה פעילות פעמיים אם יש מספיק מועמדות שונות מתאימות. לכל בחירה כתבו סיבה קצרה וברורה בעברית."""

    if state.get("feedback"):
        prompt += f"\n\nבניסיון הקודם היו בעיות: {state['feedback']}\nתקנו אותן הפעם."

    result = model.invoke(
        [
            ("system", "אתם עוזר AI שמסייע למדריכי תנועות נוער לבנות לוח פעילויות שבועי."),
            ("user", prompt),
        ]
    )
    state["items"] = [{"date": i.date, "activity_id": i.activity_id, "reason": i.reason} for i in result.items]
    state["attempt"] += 1
    return state


def _validate_node(state: _AgentState) -> _AgentState:
    valid_dates = set(state["meeting_dates"])
    valid_ids = {c["id"] for c in state["candidates"]}
    errors: list[str] = []
    seen_dates: set[str] = set()
    clean_items = []

    for item in state["items"]:
        if item["date"] not in valid_dates:
            errors.append(f"תאריך לא חוקי: {item['date']}")
            continue
        if item["date"] in seen_dates:
            errors.append(f"תאריך כפול: {item['date']}")
            continue
        if item["activity_id"] not in valid_ids:
            errors.append(f"מזהה פעילות לא חוקי: {item['activity_id']}")
            continue
        seen_dates.add(item["date"])
        clean_items.append(item)

    missing = valid_dates - seen_dates
    if missing:
        errors.append(f"חסרים תאריכים: {', '.join(sorted(missing))}")

    state["items"] = clean_items
    state["errors"] = errors
    state["feedback"] = "; ".join(errors) if errors else None
    return state


def _should_retry(state: _AgentState) -> str:
    if state["errors"] and state["attempt"] < MAX_LLM_ATTEMPTS:
        return "generate"
    return "finalize"


def _finalize_node(state: _AgentState) -> _AgentState:
    """Fills any dates the LLM left missing/invalid with the next-best
    not-yet-used heuristic candidate, so the graph always terminates
    with a complete draft even if the model only got partway there."""
    used_ids = {i["activity_id"] for i in state["items"]}
    covered_dates = {i["date"] for i in state["items"]}
    missing_dates = [d for d in state["meeting_dates"] if d not in covered_dates]
    if not missing_dates:
        return state

    pool = [c for c in state["candidates"] if c["id"] not in used_ids] or state["candidates"]
    for i, d in enumerate(missing_dates):
        choice = pool[i % len(pool)]
        state["items"].append(
            {
                "date": d,
                "activity_id": choice["id"],
                "reason": "נבחרה אוטומטית לפי דירוג (השלמת משבצת שנותרה)",
            }
        )
    return state


def _build_graph():
    from langgraph.graph import END, StateGraph

    graph = StateGraph(_AgentState)
    graph.add_node("generate", _generate_node)
    graph.add_node("validate", _validate_node)
    graph.add_node("finalize", _finalize_node)
    graph.set_entry_point("generate")
    graph.add_edge("generate", "validate")
    graph.add_conditional_edges("validate", _should_retry, {"generate": "generate", "finalize": "finalize"})
    graph.add_edge("finalize", END)
    return graph.compile()


def generate_schedule(
    db: Session,
    layer: Layer,
    profile: LayerScheduleProfile | None,
    start_date: date_type,
    end_date: date_type,
) -> AiScheduleResponse:
    meeting_days = set(profile.meeting_days.split(",")) if profile and profile.meeting_days else set()
    meeting_days.discard("")
    if not meeting_days:
        return AiScheduleResponse(
            suggestions=[],
            skipped_holiday_dates=[],
            warning="לא הוגדרו ימי מפגש קבועים לשכבה. הגדירו אותם למעלה ונסו שוב.",
        )

    all_dates = _meeting_dates(start_date, end_date, meeting_days)
    holiday_dates = _holiday_dates(start_date, end_date)
    skipped = sorted(d for d in all_dates if d in holiday_dates)
    usable_dates = [d for d in all_dates if d not in holiday_dates]

    if not usable_dates:
        return AiScheduleResponse(
            suggestions=[],
            skipped_holiday_dates=skipped,
            warning="לא נמצאו תאריכי מפגש בטווח שנבחר (או שכולם נופלים על חגים).",
        )

    activities = db.query(Activity).all()
    recent_ids = _recent_activity_ids(db, layer.id, usable_dates[0])
    layer_ratings = _layer_ratings_by_activity(db, layer.id)
    keywords = _character_keywords(profile.group_character if profile else None)
    scored = _score_candidates(activities, recent_ids, layer_ratings, keywords)
    top = scored[:CANDIDATE_POOL_SIZE]

    if not top:
        return AiScheduleResponse(
            suggestions=[],
            skipped_holiday_dates=skipped,
            warning="אין עדיין פעילויות מסוג 'מרכזית' במאגר הארצי כדי להציע מהן.",
        )

    candidates = [
        {"id": str(c["activity"].id), "name": c["activity"].name, "score": c["score"], "reasons": c["reasons"]}
        for c in top
    ]
    by_id = {str(c["activity"].id): c["activity"] for c in top}

    warning: str | None = None
    if not settings.anthropic_api_key:
        warning = "לא הוגדר מפתח AI (ANTHROPIC_API_KEY) — ההצעה הבאה מבוססת על דירוגים בלבד"
        items = _heuristic_items(usable_dates, candidates)
    else:
        try:
            graph = _build_graph()
            state: _AgentState = {
                "layer_name": layer.name,
                "group_character": profile.group_character if profile else None,
                "meeting_dates": [d.isoformat() for d in usable_dates],
                "candidates": candidates,
                "attempt": 0,
                "feedback": None,
                "items": [],
                "errors": [],
            }
            final_state = graph.invoke(state)
            items = final_state["items"]
            if not items:
                warning = "ה-AI לא הצליח להציע לו״ז תקין — ההצעה הבאה מבוססת על דירוגים בלבד"
                items = _heuristic_items(usable_dates, candidates)
        except Exception:
            # Bad/expired key, network hiccup, rate limit, etc. -- degrade
            # to the heuristic rather than fail the whole request.
            warning = "לא ניתן היה להתחבר לשירות ה-AI — ההצעה הבאה מבוססת על דירוגים בלבד"
            items = _heuristic_items(usable_dates, candidates)

    suggestions = []
    for item in sorted(items, key=lambda i: i["date"]):
        activity = by_id.get(item["activity_id"])
        if activity is None:
            continue
        d = date_type.fromisoformat(item["date"])
        suggestions.append(
            AiScheduleSuggestion(
                date=d,
                day_of_week=_weekday_name(d),
                activity_id=activity.id,
                activity_name=activity.name,
                activity_type=activity.activity_type,
                reason=item["reason"],
            )
        )

    return AiScheduleResponse(suggestions=suggestions, skipped_holiday_dates=skipped, warning=warning)

# The AI scheduling agent: given a layer's recurring weekly meeting
# days, a free-text description of the group's "character", and the
# nationwide activity repository's ratings/usage history, proposes a
# draft session-by-session schedule (opener + main + closing per
# meeting date) for a date range.
#
# Built as a small LangGraph agent on top of Claude:
#   generate -> validate -> (retry on problems, up to a cap) -> finalize
# "generate" itself is two-phase: the model first gets a chance to call
# a real search_activities tool (LangGraph/tool-calling, not just a
# canned prompt) if the pre-scored shortlist doesn't have anything it
# likes, then a second, structured-output-only call turns whatever it
# has decided into the final {date, slot, activity_id, reason} items.
#
# A heuristic ranking underneath all of this both grounds the LLM's
# shortlist (it only ever picks from pre-scored candidates, never the
# raw repository, unless it deliberately searches for more) and acts
# as the safety net: if no API key is configured, or any call fails,
# or the LLM's own output is unusable, the endpoint still returns a
# complete, valid draft built from the heuristic alone.
import uuid
from datetime import date as date_type
from datetime import timedelta
from typing import TypedDict

from sqlalchemy import or_
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
MAX_TOOL_ROUNDS = 2
CANDIDATE_POOL_SIZE_PER_TYPE = 8
SEARCH_TOOL_RESULT_LIMIT = 10

# A full session in order -- opener (short warm-up), main (the actual
# content), closing (wrap-up) -- proposed for every meeting date,
# rather than just one undifferentiated activity per date.
SLOT_TYPES = ["opener", "main", "closing"]

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
    activity_type: str,
) -> list[dict]:
    scored = []
    for a in activities:
        if a.activity_type != activity_type:
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


def _candidate_dict(scored_entry: dict, slot_type: str) -> dict:
    a = scored_entry["activity"]
    return {
        "id": str(a.id),
        "name": a.name,
        "score": scored_entry["score"],
        "reasons": scored_entry["reasons"],
        "type": slot_type,
    }


def _make_search_tool(
    db: Session,
    exclude_ids: set[uuid.UUID],
    recent_ids: set[uuid.UUID],
    layer_ratings: dict[uuid.UUID, float],
    keywords: list[str],
):
    """A real tool the LLM can call mid-turn: searches the FULL
    national activity repository (not just the pre-scored shortlist it
    was handed), for when the shortlist genuinely doesn't have
    anything that fits a date or the group's character. Returns both
    the LangChain-bindable tool (for the model to call) and a plain
    Python function returning the same scored results structurally,
    so the caller can register whatever the model finds as valid
    candidates -- not just format them as text for the model to read."""
    from langchain_core.tools import tool

    def raw_search(activity_type: str, keyword: str = "") -> list[dict]:
        if activity_type not in SLOT_TYPES:
            return []
        query = db.query(Activity).filter(Activity.activity_type == activity_type)
        if keyword:
            like = f"%{keyword}%"
            query = query.filter(or_(Activity.name.ilike(like), Activity.description.ilike(like)))
        results = [a for a in query.limit(50).all() if a.id not in exclude_ids]
        scored = _score_candidates(results, recent_ids, layer_ratings, keywords, activity_type)
        return scored[:SEARCH_TOOL_RESULT_LIMIT]

    @tool
    def search_activities(activity_type: str, keyword: str = "") -> str:
        """Search the national activity repository for more candidate
        activities beyond the ones already provided. activity_type
        must be one of: opener, main, closing. keyword optionally
        filters by a word expected in the activity's name or
        description (e.g. a theme from the group's character, or a
        holiday). Returns a scored list, best first."""
        if activity_type not in SLOT_TYPES:
            return f"activity_type חייב להיות אחד מ: {', '.join(SLOT_TYPES)}"
        scored = raw_search(activity_type, keyword)
        if not scored:
            return "לא נמצאו פעילויות מתאימות בחיפוש הזה."
        return "\n".join(
            f"- id={c['activity'].id} | {c['activity'].name} | ציון: {c['score']:.1f} | "
            f"{', '.join(c['reasons']) or 'ללא הערות מיוחדות'}"
            for c in scored
        )

    return search_activities, raw_search


def _heuristic_items(slots: list[dict], candidates_by_type: dict[str, list[dict]]) -> list[dict]:
    """Round-robins through each slot type's scored pool, best first,
    cycling back to the top once exhausted rather than ever leaving a
    slot unfilled."""
    counters: dict[str, int] = {t: 0 for t in candidates_by_type}
    items = []
    for slot in slots:
        pool = candidates_by_type.get(slot["type"])
        if not pool:
            continue
        choice = pool[counters[slot["type"]] % len(pool)]
        counters[slot["type"]] += 1
        items.append(
            {
                "date": slot["date"],
                "type": slot["type"],
                "activity_id": choice["id"],
                "reason": ", ".join(choice["reasons"]) or "הפעילות המדורגת ביותר הזמינה",
            }
        )
    return items


class _AgentState(TypedDict):
    layer_name: str
    group_character: str | None
    slots: list[dict]
    candidates: list[dict]
    attempt: int
    feedback: str | None
    items: list[dict]
    errors: list[str]
    all_errors: list[str]
    tool_calls_made: int


def _make_generate_node(search_tool, raw_search):
    def _generate_node(state: _AgentState) -> _AgentState:
        from langchain_anthropic import ChatAnthropic
        from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
        from pydantic import BaseModel, Field

        class _LlmItem(BaseModel):
            date: str = Field(description="One of the given slot dates, YYYY-MM-DD.")
            type: str = Field(description="One of: opener, main, closing -- must match the slot's own type.")
            activity_id: str = Field(description="A candidate activity id, verbatim (from the list or a search result).")
            reason: str = Field(description="Short, one-sentence reason in Hebrew for this pick.")

        class _LlmOutput(BaseModel):
            items: list[_LlmItem]

        base_model = ChatAnthropic(model="claude-sonnet-5", api_key=settings.anthropic_api_key, temperature=0.4)

        candidates_text = "\n".join(
            f"- id={c['id']} | סוג: {c['type']} | {c['name']} | ציון: {c['score']:.1f} | "
            f"{', '.join(c['reasons']) or 'ללא הערות מיוחדות'}"
            for c in state["candidates"]
        )
        slots_text = "\n".join(f"- {s['date']} / {s['type']}" for s in state["slots"])
        character_text = state["group_character"] or "לא צוין"

        prompt = f"""בונים לו״ז שבועי לשכבה "{state['layer_name']}" בתנועת נוער -- לכל תאריך מפגש בונים מפגש
מלא: פתיחה (opener), פעילות מרכזית (main), וסיכום (closing).

אופי הקבוצה: {character_text}

המשבצות שיש למלא (חובה למלא את כולן, כל משבצת פעם אחת בדיוק, כל אחת בסוג המתאים):
{slots_text}

רשימת פעילויות מועמדות -- עדיפו לבחור מתוכן, לפי ה-id המדויק:
{candidates_text}

אם באמת אין ברשימה הזו שום פעילות מתאימה למשבצת מסוימת (למשל שום "opener" שמתאים לאופי הקבוצה), מותר
לכם לקרוא לכלי search_activities כדי לחפש עוד פעילויות מהמאגר הארצי, עד {MAX_TOOL_ROUNDS} פעמים. אחרת,
בחרו ישירות מהרשימה שסופקה.

העדיפו פעילויות עם ציון גבוה יותר, אך השתדלו לגוון ולא לחזור על אותה פעילות פעמיים אם יש מספיק מועמדות
מתאימות. לכל בחירה כתבו סיבה קצרה וברורה בעברית."""

        if state.get("feedback"):
            prompt += f"\n\nבניסיון הקודם היו בעיות: {state['feedback']}\nתקנו אותן הפעם."

        messages: list = [
            SystemMessage(content="אתם עוזר AI שמסייע למדריכי תנועות נוער לבנות לוח פעילויות שבועי."),
            HumanMessage(content=prompt),
        ]

        # Phase 1: give the model real, optional tool access -- it may
        # call search_activities up to MAX_TOOL_ROUNDS times if the
        # provided shortlist genuinely isn't good enough, or just
        # proceed straight to phase 2 without calling it at all.
        tool_model = base_model.bind_tools([search_tool])
        for _ in range(MAX_TOOL_ROUNDS):
            response = tool_model.invoke(messages)
            if not isinstance(response, AIMessage) or not response.tool_calls:
                break
            messages.append(response)
            for call in response.tool_calls:
                if call["name"] == search_tool.name:
                    args = call["args"] or {}
                    found = raw_search(args.get("activity_type", ""), args.get("keyword", ""))
                    existing_ids = {c["id"] for c in state["candidates"]}
                    for c in found:
                        candidate = _candidate_dict(c, args.get("activity_type", ""))
                        if candidate["id"] not in existing_ids:
                            state["candidates"].append(candidate)
                            existing_ids.add(candidate["id"])
                    result = search_tool.invoke(args)
                else:
                    result = f"כלי לא מוכר: {call['name']}"
                messages.append(ToolMessage(content=str(result), tool_call_id=call["id"]))
                state["tool_calls_made"] += 1

        # Phase 2: a separate, structured-output-only call turns the
        # (possibly tool-enriched) conversation into the final items --
        # Anthropic's structured output forces a single specific tool
        # choice, which is incompatible with also freely choosing
        # OTHER tools in the same call, hence the two phases.
        messages.append(HumanMessage(content="עכשיו החזירו את הבחירה הסופית לכל המשבצות, בפורמט הנדרש."))
        structured_model = base_model.with_structured_output(_LlmOutput)
        result = structured_model.invoke(messages)

        state["items"] = [
            {"date": i.date, "type": i.type, "activity_id": i.activity_id, "reason": i.reason} for i in result.items
        ]
        state["attempt"] += 1
        return state

    return _generate_node


def _validate_node(state: _AgentState) -> _AgentState:
    valid_slots = {(s["date"], s["type"]) for s in state["slots"]}
    candidates_by_id = {c["id"]: c for c in state["candidates"]}
    errors: list[str] = []
    seen: set[tuple[str, str]] = set()
    clean_items = []

    for item in state["items"]:
        key = (item.get("date"), item.get("type"))
        if key not in valid_slots:
            errors.append(f"משבצת לא חוקית: {item.get('date')}/{item.get('type')}")
            continue
        if key in seen:
            errors.append(f"משבצת כפולה: {item['date']}/{item['type']}")
            continue
        candidate = candidates_by_id.get(item.get("activity_id"))
        if candidate is None:
            errors.append(f"מזהה פעילות לא חוקי: {item.get('activity_id')}")
            continue
        if candidate["type"] != item["type"]:
            errors.append(f"פעילות {item['activity_id']} אינה מסוג {item['type']}")
            continue
        seen.add(key)
        clean_items.append(item)

    missing = valid_slots - seen
    if missing:
        errors.append(f"חסרות {len(missing)} משבצות")

    state["items"] = clean_items
    state["errors"] = errors
    state["all_errors"] = state.get("all_errors", []) + errors
    state["feedback"] = "; ".join(errors) if errors else None
    return state


def _should_retry(state: _AgentState) -> str:
    if state["errors"] and state["attempt"] < MAX_LLM_ATTEMPTS:
        return "generate"
    return "finalize"


def _finalize_node(state: _AgentState) -> _AgentState:
    """Fills any slots the LLM left missing/invalid with the next-best
    not-yet-used heuristic candidate of the right type, so the graph
    always terminates with a complete draft even if the model only got
    partway there."""
    covered = {(i["date"], i["type"]) for i in state["items"]}
    missing = [s for s in state["slots"] if (s["date"], s["type"]) not in covered]
    if not missing:
        return state

    used_by_type: dict[str, set[str]] = {}
    for i in state["items"]:
        used_by_type.setdefault(i["type"], set()).add(i["activity_id"])

    pool_counters: dict[str, int] = {}
    for slot in missing:
        t = slot["type"]
        full_pool = [c for c in state["candidates"] if c["type"] == t]
        fresh_pool = [c for c in full_pool if c["id"] not in used_by_type.get(t, set())] or full_pool
        if not fresh_pool:
            continue
        idx = pool_counters.get(t, 0)
        choice = fresh_pool[idx % len(fresh_pool)]
        pool_counters[t] = idx + 1
        state["items"].append(
            {
                "date": slot["date"],
                "type": t,
                "activity_id": choice["id"],
                "reason": "נבחרה אוטומטית לפי דירוג (השלמת משבצת שנותרה)",
            }
        )
    return state


def _build_graph(search_tool, raw_search):
    from langgraph.graph import END, StateGraph

    graph = StateGraph(_AgentState)
    graph.add_node("generate", _make_generate_node(search_tool, raw_search))
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
    exclude_activity_ids: list[uuid.UUID] | None = None,
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

    exclude_ids = set(exclude_activity_ids or [])
    activities = [a for a in db.query(Activity).all() if a.id not in exclude_ids]
    recent_ids = _recent_activity_ids(db, layer.id, usable_dates[0])
    layer_ratings = _layer_ratings_by_activity(db, layer.id)
    keywords = _character_keywords(profile.group_character if profile else None)

    candidates_by_type: dict[str, list[dict]] = {}
    by_id: dict[str, Activity] = {}
    for slot_type in SLOT_TYPES:
        scored = _score_candidates(activities, recent_ids, layer_ratings, keywords, slot_type)
        candidates_by_type[slot_type] = [_candidate_dict(c, slot_type) for c in scored[:CANDIDATE_POOL_SIZE_PER_TYPE]]
        for c in scored:
            by_id[str(c["activity"].id)] = c["activity"]

    active_types = [t for t in SLOT_TYPES if candidates_by_type[t]]
    if not active_types:
        return AiScheduleResponse(
            suggestions=[],
            skipped_holiday_dates=skipped,
            warning="אין עדיין פעילויות מתאימות (פתיחה/מרכזית/סיכום) במאגר הארצי כדי להציע מהן.",
        )

    slots = [{"date": d.isoformat(), "type": t} for d in usable_dates for t in active_types]
    candidates = [c for t in active_types for c in candidates_by_type[t]]

    warning: str | None = None
    attempts_used = 1
    validation_notes: list[str] = []

    if not settings.anthropic_api_key:
        warning = "לא הוגדר מפתח AI (ANTHROPIC_API_KEY) — ההצעה הבאה מבוססת על דירוגים בלבד"
        items = _heuristic_items(slots, candidates_by_type)
    else:
        try:
            search_tool, raw_search = _make_search_tool(db, exclude_ids, recent_ids, layer_ratings, keywords)
            graph = _build_graph(search_tool, raw_search)
            state: _AgentState = {
                "layer_name": layer.name,
                "group_character": profile.group_character if profile else None,
                "slots": slots,
                "candidates": candidates,
                "attempt": 0,
                "feedback": None,
                "items": [],
                "errors": [],
                "all_errors": [],
                "tool_calls_made": 0,
            }
            final_state = graph.invoke(state)
            items = final_state["items"]
            attempts_used = final_state["attempt"]
            validation_notes = final_state.get("all_errors", [])
            if not items:
                warning = "ה-AI לא הצליח להציע לו״ז תקין — ההצעה הבאה מבוססת על דירוגים בלבד"
                items = _heuristic_items(slots, candidates_by_type)
        except Exception:
            # Bad/expired key, network hiccup, rate limit, etc. -- degrade
            # to the heuristic rather than fail the whole request.
            warning = "לא ניתן היה להתחבר לשירות ה-AI — ההצעה הבאה מבוססת על דירוגים בלבד"
            items = _heuristic_items(slots, candidates_by_type)

    suggestions = []
    slot_order = {t: i for i, t in enumerate(SLOT_TYPES)}
    for item in sorted(items, key=lambda i: (i["date"], slot_order.get(i["type"], 99))):
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

    return AiScheduleResponse(
        suggestions=suggestions,
        skipped_holiday_dates=skipped,
        warning=warning,
        attempts_used=attempts_used,
        validation_notes=validation_notes,
    )

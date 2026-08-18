# Direct unit tests for the AI scheduling agent's pure LangGraph node
# functions (validate/retry/finalize) -- these operate on plain dict
# state with no network access or LLM involved, so they're tested
# directly against hand-built state rather than through the API.
from app.services.ai_schedule_agent import (
    MAX_LLM_ATTEMPTS,
    _finalize_node,
    _should_retry,
    _validate_node,
)


def _candidate(id_, type_="main"):
    return {"id": id_, "name": f"activity-{id_}", "score": 4.0, "reasons": [], "type": type_}


def _slot(date_, type_="main"):
    return {"date": date_, "type": type_}


def test_validate_node_accepts_clean_items():
    state = {
        "slots": [_slot("2026-01-06", "main")],
        "candidates": [_candidate("a1", "main")],
        "items": [{"date": "2026-01-06", "type": "main", "activity_id": "a1", "reason": "x"}],
        "attempt": 1,
        "all_errors": [],
    }
    result = _validate_node(state)
    assert result["errors"] == []
    assert result["feedback"] is None
    assert len(result["items"]) == 1


def test_validate_node_rejects_duplicate_slot():
    item = {"date": "2026-01-06", "type": "main", "activity_id": "a1", "reason": "x"}
    state = {
        "slots": [_slot("2026-01-06", "main")],
        "candidates": [_candidate("a1", "main")],
        "items": [item, dict(item)],
        "attempt": 1,
        "all_errors": [],
    }
    result = _validate_node(state)
    assert len(result["items"]) == 1
    assert any("כפולה" in e for e in result["errors"])


def test_validate_node_rejects_unknown_activity_id():
    state = {
        "slots": [_slot("2026-01-06", "main")],
        "candidates": [_candidate("a1", "main")],
        "items": [{"date": "2026-01-06", "type": "main", "activity_id": "does-not-exist", "reason": "x"}],
        "attempt": 1,
        "all_errors": [],
    }
    result = _validate_node(state)
    assert result["items"] == []
    assert any("לא חוקי" in e for e in result["errors"])


def test_validate_node_rejects_type_mismatch():
    """A candidate that IS in the pool but of the wrong type for the
    slot it was assigned to (e.g. an opener picked for a main slot)."""
    state = {
        "slots": [_slot("2026-01-06", "main")],
        "candidates": [_candidate("a1", "opener")],
        "items": [{"date": "2026-01-06", "type": "main", "activity_id": "a1", "reason": "x"}],
        "attempt": 1,
        "all_errors": [],
    }
    result = _validate_node(state)
    assert result["items"] == []
    assert any("אינה מסוג" in e for e in result["errors"])


def test_validate_node_reports_missing_slots():
    state = {
        "slots": [_slot("2026-01-06", "main"), _slot("2026-01-13", "main")],
        "candidates": [_candidate("a1", "main")],
        "items": [{"date": "2026-01-06", "type": "main", "activity_id": "a1", "reason": "x"}],
        "attempt": 1,
        "all_errors": [],
    }
    result = _validate_node(state)
    assert any("חסרות" in e for e in result["errors"])


def test_validate_node_accumulates_errors_across_attempts():
    state = {
        "slots": [_slot("2026-01-06", "main")],
        "candidates": [_candidate("a1", "main")],
        "items": [{"date": "2026-01-06", "type": "main", "activity_id": "bad", "reason": "x"}],
        "attempt": 1,
        "all_errors": ["previous round error"],
    }
    result = _validate_node(state)
    assert "previous round error" in result["all_errors"]
    # Both a bad-id error AND a missing-slot error are legitimately
    # generated this round (the invalid item leaves the slot
    # uncovered too) -- accumulated on top of the prior round's error.
    assert len(result["all_errors"]) == 3


def test_should_retry_when_errors_and_attempts_remain():
    assert _should_retry({"errors": ["x"], "attempt": 1}) == "generate"


def test_should_retry_finalizes_when_no_errors():
    assert _should_retry({"errors": [], "attempt": 1}) == "finalize"


def test_should_retry_finalizes_once_attempts_exhausted():
    assert _should_retry({"errors": ["x"], "attempt": MAX_LLM_ATTEMPTS}) == "finalize"


def test_finalize_node_is_noop_when_nothing_missing():
    state = {
        "slots": [_slot("2026-01-06", "main")],
        "candidates": [_candidate("a1", "main")],
        "items": [{"date": "2026-01-06", "type": "main", "activity_id": "a1", "reason": "x"}],
    }
    result = _finalize_node(state)
    assert len(result["items"]) == 1


def test_finalize_node_fills_missing_slot_with_matching_type():
    state = {
        "slots": [_slot("2026-01-06", "main"), _slot("2026-01-06", "opener")],
        "candidates": [_candidate("m1", "main"), _candidate("o1", "opener")],
        "items": [{"date": "2026-01-06", "type": "main", "activity_id": "m1", "reason": "x"}],
    }
    result = _finalize_node(state)
    assert len(result["items"]) == 2
    opener_item = next(i for i in result["items"] if i["type"] == "opener")
    assert opener_item["activity_id"] == "o1"


def test_finalize_node_prefers_unused_candidate_of_same_type():
    state = {
        "slots": [_slot("2026-01-06", "main"), _slot("2026-01-13", "main")],
        "candidates": [_candidate("m1", "main"), _candidate("m2", "main")],
        "items": [{"date": "2026-01-06", "type": "main", "activity_id": "m1", "reason": "x"}],
    }
    result = _finalize_node(state)
    filled = next(i for i in result["items"] if i["date"] == "2026-01-13")
    assert filled["activity_id"] == "m2"

# Tests for the layer schedule profile (weekly meeting days + group
# character) and the AI scheduling agent's draft proposal endpoint.
# No ANTHROPIC_API_KEY is configured in the test environment, so these
# exercise the heuristic fallback path deterministically -- the
# LangGraph/Claude path itself is exempt from automated testing here
# (it would require network access and a real key).
from datetime import date, timedelta


def _register(client, email, password="pass1234", full_name="Test User"):
    response = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "full_name": full_name},
    )
    body = response.json()
    return body["access_token"], body["user"]


def _auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def _make_admin_with_layer(client, admin_email, layer_name="Layer A", institution_name="Test Institution"):
    admin_token, admin_user = _register(client, admin_email)
    client.post(
        "/api/v1/institutions", json={"name": institution_name}, headers=_auth_headers(admin_token)
    )
    layer = client.post(
        "/api/v1/layers", json={"name": layer_name}, headers=_auth_headers(admin_token)
    ).json()
    return admin_token, admin_user, layer


def _create_activity(client, token, **overrides):
    payload = {
        "name": "משחק גיבוש",
        "description": "משחק קבוצתי תוסס עם תחרויות",
        "activity_type": "main",
    }
    payload.update(overrides)
    return client.post("/api/v1/activities", json=payload, headers=_auth_headers(token)).json()


def _next_weekday(target_weekday_iso: int) -> date:
    """Next date (today or later) whose isoweekday() matches
    target_weekday_iso (1=Monday..7=Sunday)."""
    today = date.today()
    days_ahead = (target_weekday_iso - today.isoweekday()) % 7
    return today + timedelta(days=days_ahead)


def test_schedule_profile_defaults_empty_then_roundtrips(client):
    admin_token, _, layer = _make_admin_with_layer(client, "profiledefault@test.com")

    empty = client.get(f"/api/v1/layers/{layer['id']}/schedule-profile", headers=_auth_headers(admin_token))
    assert empty.status_code == 200
    assert empty.json() == {"meeting_days": [], "group_character": None}

    saved = client.put(
        f"/api/v1/layers/{layer['id']}/schedule-profile",
        json={"meeting_days": ["tuesday", "thursday"], "group_character": "שכבה תוססת ואוהבת תחרויות"},
        headers=_auth_headers(admin_token),
    )
    assert saved.status_code == 200
    assert saved.json()["meeting_days"] == ["tuesday", "thursday"]
    assert saved.json()["group_character"] == "שכבה תוססת ואוהבת תחרויות"

    fetched = client.get(f"/api/v1/layers/{layer['id']}/schedule-profile", headers=_auth_headers(admin_token))
    assert fetched.json()["meeting_days"] == ["tuesday", "thursday"]


def test_only_manager_can_set_schedule_profile(client):
    admin_token, _, layer = _make_admin_with_layer(client, "profilemanager@test.com")
    other_token, _ = _register(client, "profileoutsider@test.com")

    response = client.put(
        f"/api/v1/layers/{layer['id']}/schedule-profile",
        json={"meeting_days": ["sunday"]},
        headers=_auth_headers(other_token),
    )
    assert response.status_code == 404


def test_ai_schedule_without_profile_warns(client):
    admin_token, _, layer = _make_admin_with_layer(client, "aischeduleempty@test.com")
    today = date.today()

    response = client.post(
        f"/api/v1/layers/{layer['id']}/ai-schedule",
        json={"start_date": today.isoformat(), "end_date": (today + timedelta(days=14)).isoformat()},
        headers=_auth_headers(admin_token),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["suggestions"] == []
    assert "לא הוגדרו ימי מפגש" in body["warning"]


def test_ai_schedule_end_before_start_is_rejected(client):
    admin_token, _, layer = _make_admin_with_layer(client, "aischeduledaterange@test.com")
    today = date.today()

    response = client.post(
        f"/api/v1/layers/{layer['id']}/ai-schedule",
        json={"start_date": today.isoformat(), "end_date": (today - timedelta(days=1)).isoformat()},
        headers=_auth_headers(admin_token),
    )
    assert response.status_code == 422


def test_ai_schedule_range_too_long_is_rejected(client):
    admin_token, _, layer = _make_admin_with_layer(client, "aischeduletoolong@test.com")
    today = date.today()

    response = client.post(
        f"/api/v1/layers/{layer['id']}/ai-schedule",
        json={"start_date": today.isoformat(), "end_date": (today + timedelta(days=200)).isoformat()},
        headers=_auth_headers(admin_token),
    )
    assert response.status_code == 422


def test_ai_schedule_heuristic_fallback_fills_every_meeting_date(client):
    admin_token, _, layer = _make_admin_with_layer(client, "aischeduleheuristic@test.com")
    _create_activity(client, admin_token, name="פעילות א")
    _create_activity(client, admin_token, name="פעילות ב")

    client.put(
        f"/api/v1/layers/{layer['id']}/schedule-profile",
        json={"meeting_days": ["tuesday"], "group_character": "תוססת"},
        headers=_auth_headers(admin_token),
    )

    start = _next_weekday(2)  # next Tuesday (ISO weekday 2)
    end = start + timedelta(days=21)  # spans 3-4 Tuesdays

    response = client.post(
        f"/api/v1/layers/{layer['id']}/ai-schedule",
        json={"start_date": start.isoformat(), "end_date": end.isoformat()},
        headers=_auth_headers(admin_token),
    )

    assert response.status_code == 200
    body = response.json()
    assert "לא הוגדר מפתח AI" in body["warning"]
    assert len(body["suggestions"]) >= 3
    for s in body["suggestions"]:
        assert s["day_of_week"] == "tuesday"
        assert s["activity_type"] == "main"
        assert s["reason"]


def test_ai_schedule_prefers_layers_own_higher_rating(client):
    admin_token, _, layer = _make_admin_with_layer(client, "aischeduleratingpref@test.com")
    liked = _create_activity(client, admin_token, name="הפעילות האהובה")
    disliked = _create_activity(client, admin_token, name="הפעילות הפחות אהובה")

    client.post(
        f"/api/v1/activities/{liked['id']}/ratings",
        json={"layer_id": layer["id"], "rating": 5},
        headers=_auth_headers(admin_token),
    )
    client.post(
        f"/api/v1/activities/{disliked['id']}/ratings",
        json={"layer_id": layer["id"], "rating": 1},
        headers=_auth_headers(admin_token),
    )

    client.put(
        f"/api/v1/layers/{layer['id']}/schedule-profile",
        json={"meeting_days": ["wednesday"]},
        headers=_auth_headers(admin_token),
    )

    start = _next_weekday(3)  # next Wednesday

    response = client.post(
        f"/api/v1/layers/{layer['id']}/ai-schedule",
        json={"start_date": start.isoformat(), "end_date": start.isoformat()},
        headers=_auth_headers(admin_token),
    )

    assert response.status_code == 200
    suggestions = response.json()["suggestions"]
    assert len(suggestions) == 1
    assert suggestions[0]["activity_id"] == liked["id"]


def test_ai_schedule_skips_holiday_dates(client):
    from app.services.holiday_service import list_israeli_holidays

    admin_token, _, layer = _make_admin_with_layer(client, "aischeduleholiday@test.com")
    _create_activity(client, admin_token)

    # Find a real, concrete holiday date next year (computed from the
    # actual Hebrew calendar) instead of guessing a Gregorian window --
    # holidays like Passover shift every year, so this stays correct
    # regardless of when the test suite runs.
    year = date.today().year + 1
    holidays = list_israeli_holidays(date(year, 1, 1), date(year, 12, 31))
    assert holidays, "expected at least one Israeli holiday next year"
    holiday_date = holidays[0].start_date

    client.put(
        f"/api/v1/layers/{layer['id']}/schedule-profile",
        json={"meeting_days": ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]},
        headers=_auth_headers(admin_token),
    )

    response = client.post(
        f"/api/v1/layers/{layer['id']}/ai-schedule",
        json={"start_date": holiday_date.isoformat(), "end_date": holiday_date.isoformat()},
        headers=_auth_headers(admin_token),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["skipped_holiday_dates"] == [holiday_date.isoformat()]
    assert body["suggestions"] == []


def test_only_manager_can_request_ai_schedule(client):
    admin_token, _, layer = _make_admin_with_layer(client, "aischedulemanager@test.com")
    other_token, _ = _register(client, "aischeduleoutsider@test.com")
    today = date.today()

    response = client.post(
        f"/api/v1/layers/{layer['id']}/ai-schedule",
        json={"start_date": today.isoformat(), "end_date": (today + timedelta(days=7)).isoformat()},
        headers=_auth_headers(other_token),
    )
    assert response.status_code == 404

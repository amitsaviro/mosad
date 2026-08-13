# Tests for pinning a repository activity onto a real calendar date for
# a specific layer: creation, institution-wide listing, permissions,
# is_past flagging, and cascade delete when the activity is removed.
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
        "name": "טיול שנתי",
        "description": "יום כיף בטבע",
        "activity_type": "main",
    }
    payload.update(overrides)
    return client.post("/api/v1/activities", json=payload, headers=_auth_headers(token)).json()


def _pin(client, token, layer_id, activity_id, day, **overrides):
    payload = {"activity_id": activity_id, "date": day}
    payload.update(overrides)
    return client.post(
        f"/api/v1/layers/{layer_id}/calendar-activities", json=payload, headers=_auth_headers(token)
    )


def test_create_and_list_calendar_activity(client):
    admin_token, _, layer = _make_admin_with_layer(client, "caladmin@test.com")
    activity = _create_activity(client, admin_token)
    future = (date.today() + timedelta(days=10)).isoformat()

    response = _pin(client, admin_token, layer["id"], activity["id"], future, notes="לבדוק אוטובוס")

    assert response.status_code == 201
    entry = response.json()
    assert entry["activity_name"] == activity["name"]
    assert entry["layer_name"] == layer["name"]
    assert entry["date"] == future
    assert entry["notes"] == "לבדוק אוטובוס"
    assert entry["can_manage"] is True
    assert entry["is_past"] is False

    listed = client.get("/api/v1/calendar-activities", headers=_auth_headers(admin_token))
    assert listed.status_code == 200
    assert len(listed.json()) == 1


def test_equipment_defaults_and_toggle(client):
    admin_token, _, layer = _make_admin_with_layer(client, "calequip@test.com")
    activity = _create_activity(client, admin_token, equipment=["חבל", "מים"])
    entry = _pin(client, admin_token, layer["id"], activity["id"], date.today().isoformat()).json()

    assert entry["equipment"] == ["חבל", "מים"]
    assert entry["equipment_checked"] == []

    response = client.patch(
        f"/api/v1/calendar-activities/{entry['id']}",
        json={"equipment_checked": ["חבל"]},
        headers=_auth_headers(admin_token),
    )
    assert response.status_code == 200
    assert response.json()["equipment_checked"] == ["חבל"]


def test_update_notes(client):
    admin_token, _, layer = _make_admin_with_layer(client, "calnotes@test.com")
    activity = _create_activity(client, admin_token)
    entry = _pin(client, admin_token, layer["id"], activity["id"], date.today().isoformat()).json()

    response = client.patch(
        f"/api/v1/calendar-activities/{entry['id']}",
        json={"notes": "לקחת אוטובוס 9:00"},
        headers=_auth_headers(admin_token),
    )
    assert response.status_code == 200
    assert response.json()["notes"] == "לקחת אוטובוס 9:00"


def test_only_manager_can_update_calendar_activity(client):
    admin_token, _, layer = _make_admin_with_layer(client, "calupdatemanager@test.com")
    activity = _create_activity(client, admin_token)
    entry = _pin(client, admin_token, layer["id"], activity["id"], date.today().isoformat()).json()
    other_token, _ = _register(client, "calupdateoutsider@test.com")

    response = client.patch(
        f"/api/v1/calendar-activities/{entry['id']}",
        json={"notes": "should not work"},
        headers=_auth_headers(other_token),
    )
    assert response.status_code == 404


def test_past_date_is_flagged(client):
    admin_token, _, layer = _make_admin_with_layer(client, "calpast@test.com")
    activity = _create_activity(client, admin_token)
    past = (date.today() - timedelta(days=3)).isoformat()

    entry = _pin(client, admin_token, layer["id"], activity["id"], past).json()

    assert entry["is_past"] is True


def test_only_manager_can_pin_calendar_activity(client):
    admin_token, _, layer = _make_admin_with_layer(client, "calmanager@test.com")
    activity = _create_activity(client, admin_token)
    other_token, _ = _register(client, "caloutsider@test.com")

    response = _pin(client, other_token, layer["id"], activity["id"], date.today().isoformat())

    assert response.status_code == 404


def test_any_institution_member_can_view_calendar_activities(client):
    admin_token, _, layer = _make_admin_with_layer(client, "calviewadmin@test.com")
    activity = _create_activity(client, admin_token)
    _pin(client, admin_token, layer["id"], activity["id"], date.today().isoformat())

    # A different layer in the same institution -- joining it grants
    # institution-wide *view* access to layer A's calendar activity
    # without making the counselor an assigned manager of layer A.
    other_layer = client.post(
        "/api/v1/layers", json={"name": "Layer B"}, headers=_auth_headers(admin_token)
    ).json()
    counselor_token, _ = _register(client, "calviewcounselor@test.com")
    client.post(
        "/api/v1/layers/join",
        json={"join_code": other_layer["join_code"]},
        headers=_auth_headers(counselor_token),
    )

    listed = client.get("/api/v1/calendar-activities", headers=_auth_headers(counselor_token))
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    assert listed.json()[0]["can_manage"] is False


def test_user_with_no_institution_sees_empty_calendar_activities(client):
    token, _ = _register(client, "calnoinst@test.com")

    response = client.get("/api/v1/calendar-activities", headers=_auth_headers(token))

    assert response.status_code == 200
    assert response.json() == []


def test_delete_calendar_activity(client):
    admin_token, _, layer = _make_admin_with_layer(client, "caldelete@test.com")
    activity = _create_activity(client, admin_token)
    entry = _pin(client, admin_token, layer["id"], activity["id"], date.today().isoformat()).json()

    response = client.delete(f"/api/v1/calendar-activities/{entry['id']}", headers=_auth_headers(admin_token))
    assert response.status_code == 204

    listed = client.get("/api/v1/calendar-activities", headers=_auth_headers(admin_token))
    assert listed.json() == []


def test_deleting_activity_removes_its_calendar_entries(client):
    admin_token, _, layer = _make_admin_with_layer(client, "calcascade@test.com")
    activity = _create_activity(client, admin_token)
    _pin(client, admin_token, layer["id"], activity["id"], date.today().isoformat())

    delete_response = client.delete(f"/api/v1/activities/{activity['id']}", headers=_auth_headers(admin_token))
    assert delete_response.status_code == 204

    listed = client.get("/api/v1/calendar-activities", headers=_auth_headers(admin_token))
    assert listed.json() == []


def test_timed_slot_roundtrips_start_time_and_duration(client):
    admin_token, _, layer = _make_admin_with_layer(client, "caltimed@test.com")
    activity = _create_activity(client, admin_token, duration_minutes=45, equipment=["חבל", "טבעות"])
    today = date.today().isoformat()

    entry = _pin(
        client, admin_token, layer["id"], activity["id"], today, start_time="16:00:00"
    ).json()

    assert entry["start_time"] == "16:00:00"
    assert entry["duration_minutes"] == 45
    assert entry["equipment"] == ["חבל", "טבעות"]


def test_overlapping_timed_slot_on_same_date_is_rejected(client):
    admin_token, _, layer = _make_admin_with_layer(client, "caloverlap@test.com")
    activity = _create_activity(client, admin_token, duration_minutes=60)
    today = date.today().isoformat()

    first = _pin(client, admin_token, layer["id"], activity["id"], today, start_time="16:00:00")
    assert first.status_code == 201

    overlapping = _pin(client, admin_token, layer["id"], activity["id"], today, start_time="16:30:00")
    assert overlapping.status_code == 409

    non_overlapping = _pin(client, admin_token, layer["id"], activity["id"], today, start_time="17:00:00")
    assert non_overlapping.status_code == 201


def test_same_start_time_is_treated_as_composite_block(client):
    admin_token, _, layer = _make_admin_with_layer(client, "calcomposite@test.com")
    opener = _create_activity(client, admin_token, name="פתיחה", activity_type="opener", duration_minutes=15)
    main = _create_activity(client, admin_token, name="מרכזית", activity_type="main", duration_minutes=45)
    today = date.today().isoformat()

    first = _pin(client, admin_token, layer["id"], opener["id"], today, start_time="16:00:00")
    assert first.status_code == 201

    # Exact same start time = an intentional composite block (opener +
    # main together), not a double-booking -- must be allowed.
    second = _pin(client, admin_token, layer["id"], main["id"], today, start_time="16:00:00")
    assert second.status_code == 201


def test_untimed_entries_do_not_conflict(client):
    admin_token, _, layer = _make_admin_with_layer(client, "caluntimed@test.com")
    activity = _create_activity(client, admin_token)
    today = date.today().isoformat()

    first = _pin(client, admin_token, layer["id"], activity["id"], today)
    assert first.status_code == 201

    second = _pin(client, admin_token, layer["id"], activity["id"], today)
    assert second.status_code == 201


def test_moving_slot_into_conflict_is_rejected(client):
    admin_token, _, layer = _make_admin_with_layer(client, "calmoveconflict@test.com")
    activity = _create_activity(client, admin_token, duration_minutes=30)
    today = date.today().isoformat()
    _pin(client, admin_token, layer["id"], activity["id"], today, start_time="16:00:00")
    second = _pin(client, admin_token, layer["id"], activity["id"], today, start_time="17:00:00").json()

    response = client.patch(
        f"/api/v1/calendar-activities/{second['id']}",
        json={"start_time": "16:15:00"},
        headers=_auth_headers(admin_token),
    )

    assert response.status_code == 409

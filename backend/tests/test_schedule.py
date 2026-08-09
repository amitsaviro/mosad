# Tests for a layer's weekly schedule: pinning repository activities
# onto day/time slots, per-slot equipment checklist, time-conflict
# detection, and permissions.


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
        "name": "משחק פתיחה כיפי",
        "description": "משחק שבירת קרח לתחילת הפעילות",
        "activity_type": "opener",
    }
    payload.update(overrides)
    return client.post("/api/v1/activities", json=payload, headers=_auth_headers(token)).json()


def _schedule(client, token, layer_id, activity_id, day="sunday", start="16:00:00", **overrides):
    payload = {"activity_id": activity_id, "day_of_week": day, "start_time": start}
    payload.update(overrides)
    return client.post(f"/api/v1/layers/{layer_id}/schedule", json=payload, headers=_auth_headers(token))


def test_create_and_list_scheduled_activity(client):
    admin_token, _, layer = _make_admin_with_layer(client, "scheduleadmin@test.com")
    activity = _create_activity(client, admin_token, duration_minutes=45, equipment=["חבל", "טבעות"])

    response = _schedule(client, admin_token, layer["id"], activity["id"])

    assert response.status_code == 201
    entry = response.json()
    assert entry["activity_name"] == activity["name"]
    assert entry["duration_minutes"] == 45
    assert entry["equipment"] == ["חבל", "טבעות"]
    assert entry["equipment_checked"] == []
    assert entry["can_manage"] is True

    listed = client.get(f"/api/v1/layers/{layer['id']}/schedule", headers=_auth_headers(admin_token))
    assert listed.status_code == 200
    assert len(listed.json()) == 1


def test_only_manager_can_schedule(client):
    admin_token, _, layer = _make_admin_with_layer(client, "scheduleadmin2@test.com")
    activity = _create_activity(client, admin_token)
    other_token, _ = _register(client, "outsider@test.com")

    response = _schedule(client, other_token, layer["id"], activity["id"])

    assert response.status_code == 404


def test_overlapping_slot_is_rejected(client):
    admin_token, _, layer = _make_admin_with_layer(client, "scheduleoverlap@test.com")
    activity = _create_activity(client, admin_token, duration_minutes=60)

    first = _schedule(client, admin_token, layer["id"], activity["id"], start="16:00:00")
    assert first.status_code == 201

    overlapping = _schedule(client, admin_token, layer["id"], activity["id"], start="16:30:00")
    assert overlapping.status_code == 409

    non_overlapping = _schedule(client, admin_token, layer["id"], activity["id"], start="17:00:00")
    assert non_overlapping.status_code == 201


def test_same_start_time_is_treated_as_composite_block(client):
    admin_token, _, layer = _make_admin_with_layer(client, "schedulecomposite@test.com")
    opener = _create_activity(client, admin_token, name="פתיחה", activity_type="opener", duration_minutes=15)
    main = _create_activity(client, admin_token, name="מרכזית", activity_type="main", duration_minutes=45)

    first = _schedule(client, admin_token, layer["id"], opener["id"], start="16:00:00")
    assert first.status_code == 201

    # Exact same start time = an intentional composite block (opener +
    # main together), not a double-booking -- must be allowed.
    second = _schedule(client, admin_token, layer["id"], main["id"], start="16:00:00")
    assert second.status_code == 201

    listed = client.get(f"/api/v1/layers/{layer['id']}/schedule", headers=_auth_headers(admin_token)).json()
    assert len(listed) == 2


def test_update_scheduled_activity_and_toggle_equipment(client):
    admin_token, _, layer = _make_admin_with_layer(client, "scheduleupdate@test.com")
    activity = _create_activity(client, admin_token, equipment=["חבל", "מים"])
    entry = _schedule(client, admin_token, layer["id"], activity["id"]).json()

    response = client.patch(
        f"/api/v1/schedule/{entry['id']}",
        json={"equipment_checked": ["חבל"], "notes": "הבאנו הכל חוץ ממים"},
        headers=_auth_headers(admin_token),
    )

    assert response.status_code == 200
    updated = response.json()
    assert updated["equipment_checked"] == ["חבל"]
    assert updated["notes"] == "הבאנו הכל חוץ ממים"


def test_moving_slot_into_conflict_is_rejected(client):
    admin_token, _, layer = _make_admin_with_layer(client, "schedulemoveupdate@test.com")
    activity = _create_activity(client, admin_token, duration_minutes=30)
    _schedule(client, admin_token, layer["id"], activity["id"], start="16:00:00")
    second = _schedule(client, admin_token, layer["id"], activity["id"], start="17:00:00").json()

    response = client.patch(
        f"/api/v1/schedule/{second['id']}",
        json={"start_time": "16:15:00"},
        headers=_auth_headers(admin_token),
    )

    assert response.status_code == 409


def test_delete_scheduled_activity(client):
    admin_token, _, layer = _make_admin_with_layer(client, "scheduledelete@test.com")
    activity = _create_activity(client, admin_token)
    entry = _schedule(client, admin_token, layer["id"], activity["id"], day="monday", start="10:00:00").json()

    response = client.delete(f"/api/v1/schedule/{entry['id']}", headers=_auth_headers(admin_token))
    assert response.status_code == 204

    listed = client.get(f"/api/v1/layers/{layer['id']}/schedule", headers=_auth_headers(admin_token))
    assert listed.json() == []


def test_deleting_activity_removes_its_schedule_entries(client):
    admin_token, _, layer = _make_admin_with_layer(client, "schedulecascade@test.com")
    activity = _create_activity(client, admin_token)
    _schedule(client, admin_token, layer["id"], activity["id"], day="tuesday", start="12:00:00")

    delete_response = client.delete(f"/api/v1/activities/{activity['id']}", headers=_auth_headers(admin_token))
    assert delete_response.status_code == 204

    listed = client.get(f"/api/v1/layers/{layer['id']}/schedule", headers=_auth_headers(admin_token))
    assert listed.json() == []

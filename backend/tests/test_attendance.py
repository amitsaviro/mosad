# Tests for taking attendance: bulk-mark a layer for a date (upsert
# semantics on re-marking), per-date listing, per-participant history +
# summary, and permission boundaries.
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


def _create_participant(client, token, layer_id, full_name="Yossi Cohen"):
    return client.post(
        f"/api/v1/layers/{layer_id}/participants", json={"full_name": full_name}, headers=_auth_headers(token)
    ).json()


def test_mark_and_list_attendance(client):
    admin_token, _, layer = _make_admin_with_layer(client, "attadmin@test.com")
    p1 = _create_participant(client, admin_token, layer["id"], "Yossi")
    p2 = _create_participant(client, admin_token, layer["id"], "Dana")
    today = date.today().isoformat()

    response = client.post(
        f"/api/v1/layers/{layer['id']}/attendance",
        json={"date": today, "records": [
            {"participant_id": p1["id"], "present": True},
            {"participant_id": p2["id"], "present": False},
        ]},
        headers=_auth_headers(admin_token),
    )

    assert response.status_code == 200
    records = response.json()
    assert len(records) == 2
    by_participant = {r["participant_id"]: r for r in records}
    assert by_participant[p1["id"]]["present"] is True
    assert by_participant[p2["id"]]["present"] is False
    assert by_participant[p1["id"]]["participant_name"] == "Yossi"

    listed = client.get(
        f"/api/v1/layers/{layer['id']}/attendance", params={"date": today}, headers=_auth_headers(admin_token)
    )
    assert listed.status_code == 200
    assert len(listed.json()) == 2


def test_remarking_same_date_updates_instead_of_duplicating(client):
    admin_token, _, layer = _make_admin_with_layer(client, "attremark@test.com")
    participant = _create_participant(client, admin_token, layer["id"])
    today = date.today().isoformat()

    client.post(
        f"/api/v1/layers/{layer['id']}/attendance",
        json={"date": today, "records": [{"participant_id": participant["id"], "present": True}]},
        headers=_auth_headers(admin_token),
    )
    second = client.post(
        f"/api/v1/layers/{layer['id']}/attendance",
        json={"date": today, "records": [{"participant_id": participant["id"], "present": False}]},
        headers=_auth_headers(admin_token),
    )
    assert second.status_code == 200

    listed = client.get(
        f"/api/v1/layers/{layer['id']}/attendance", params={"date": today}, headers=_auth_headers(admin_token)
    ).json()
    assert len(listed) == 1
    assert listed[0]["present"] is False


def test_only_manager_can_mark_attendance(client):
    admin_token, _, layer = _make_admin_with_layer(client, "attmanager@test.com")
    participant = _create_participant(client, admin_token, layer["id"])
    outsider_token, _ = _register(client, "attoutsider@test.com")

    response = client.post(
        f"/api/v1/layers/{layer['id']}/attendance",
        json={"date": date.today().isoformat(), "records": [{"participant_id": participant["id"], "present": True}]},
        headers=_auth_headers(outsider_token),
    )

    assert response.status_code == 404


def test_participant_attendance_history_and_summary(client):
    admin_token, _, layer = _make_admin_with_layer(client, "atthistory@test.com")
    participant = _create_participant(client, admin_token, layer["id"])
    day1 = date.today().isoformat()
    day2 = (date.today() - timedelta(days=7)).isoformat()

    client.post(
        f"/api/v1/layers/{layer['id']}/attendance",
        json={"date": day1, "records": [{"participant_id": participant["id"], "present": True}]},
        headers=_auth_headers(admin_token),
    )
    client.post(
        f"/api/v1/layers/{layer['id']}/attendance",
        json={"date": day2, "records": [{"participant_id": participant["id"], "present": False}]},
        headers=_auth_headers(admin_token),
    )

    history = client.get(
        f"/api/v1/participants/{participant['id']}/attendance", headers=_auth_headers(admin_token)
    )
    assert history.status_code == 200
    assert len(history.json()) == 2

    summary = client.get(
        f"/api/v1/participants/{participant['id']}/attendance-summary", headers=_auth_headers(admin_token)
    ).json()
    assert summary["total_sessions"] == 2
    assert summary["present_count"] == 1
    assert summary["rate"] == 50.0


def test_marking_participant_from_another_layer_is_rejected(client):
    admin_token, _, layer = _make_admin_with_layer(client, "attcross@test.com")
    other_layer = client.post(
        "/api/v1/layers", json={"name": "Other Layer"}, headers=_auth_headers(admin_token)
    ).json()
    other_participant = _create_participant(client, admin_token, other_layer["id"])

    response = client.post(
        f"/api/v1/layers/{layer['id']}/attendance",
        json={
            "date": date.today().isoformat(),
            "records": [{"participant_id": other_participant["id"], "present": True}],
        },
        headers=_auth_headers(admin_token),
    )

    assert response.status_code == 404

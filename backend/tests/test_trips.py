# Tests for a layer's trip file (תיק טיול): the trip itself, its
# equipment/shopping checklists, document links, itinerary, the
# per-participant confirmation roster, and permission boundaries.
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


def _create_trip(client, token, layer_id, **overrides):
    payload = {"name": "טיול לצפון", "start_date": date.today().isoformat()}
    payload.update(overrides)
    return client.post(f"/api/v1/layers/{layer_id}/trips", json=payload, headers=_auth_headers(token))


def test_create_and_list_trip(client):
    admin_token, _, layer = _make_admin_with_layer(client, "tripadmin@test.com")

    response = _create_trip(client, admin_token, layer["id"], destination="נחל דן")

    assert response.status_code == 201
    trip = response.json()
    assert trip["name"] == "טיול לצפון"
    assert trip["destination"] == "נחל דן"
    # No end_date given -- defaults to a single-day trip.
    assert trip["end_date"] == trip["start_date"]

    listed = client.get(f"/api/v1/layers/{layer['id']}/trips", headers=_auth_headers(admin_token))
    assert listed.status_code == 200
    assert len(listed.json()) == 1


def test_end_date_before_start_date_is_rejected(client):
    admin_token, _, layer = _make_admin_with_layer(client, "tripdaterange@test.com")
    today = date.today()

    response = _create_trip(
        client,
        admin_token,
        layer["id"],
        start_date=today.isoformat(),
        end_date=(today - timedelta(days=1)).isoformat(),
    )

    assert response.status_code == 422


def test_only_manager_can_create_trip(client):
    admin_token, _, layer = _make_admin_with_layer(client, "tripcreatemanager@test.com")
    other_token, _ = _register(client, "tripcreateoutsider@test.com")

    response = _create_trip(client, other_token, layer["id"])

    assert response.status_code == 404


def test_any_institution_member_can_view_trip(client):
    admin_token, _, layer = _make_admin_with_layer(client, "tripviewadmin@test.com")
    trip = _create_trip(client, admin_token, layer["id"]).json()
    other_layer = client.post(
        "/api/v1/layers", json={"name": "Layer B"}, headers=_auth_headers(admin_token)
    ).json()
    counselor_token, _ = _register(client, "tripviewcounselor@test.com")
    client.post(
        "/api/v1/layers/join", json={"join_code": other_layer["join_code"]}, headers=_auth_headers(counselor_token)
    )

    response = client.get(f"/api/v1/trips/{trip['id']}", headers=_auth_headers(counselor_token))
    assert response.status_code == 200
    assert response.json()["can_manage"] is False


def test_equipment_and_shopping_checklists(client):
    admin_token, _, layer = _make_admin_with_layer(client, "tripchecklist@test.com")
    trip = _create_trip(client, admin_token, layer["id"]).json()

    equip = client.post(
        f"/api/v1/trips/{trip['id']}/equipment", json={"label": "שקי שינה"}, headers=_auth_headers(admin_token)
    )
    assert equip.status_code == 201
    equip_item = equip.json()
    assert equip_item["checked"] is False

    toggled = client.patch(
        f"/api/v1/trips/{trip['id']}/equipment/{equip_item['id']}",
        json={"checked": True},
        headers=_auth_headers(admin_token),
    )
    assert toggled.status_code == 200
    assert toggled.json()["checked"] is True

    shop = client.post(
        f"/api/v1/trips/{trip['id']}/shopping", json={"label": "חטיפים"}, headers=_auth_headers(admin_token)
    )
    assert shop.status_code == 201

    detail = client.get(f"/api/v1/trips/{trip['id']}", headers=_auth_headers(admin_token)).json()
    assert len(detail["equipment"]) == 1
    assert detail["equipment"][0]["checked"] is True
    assert len(detail["shopping"]) == 1

    delete_response = client.delete(
        f"/api/v1/trips/{trip['id']}/equipment/{equip_item['id']}", headers=_auth_headers(admin_token)
    )
    assert delete_response.status_code == 204
    after_delete = client.get(f"/api/v1/trips/{trip['id']}", headers=_auth_headers(admin_token)).json()
    assert after_delete["equipment"] == []


def test_documents(client):
    admin_token, _, layer = _make_admin_with_layer(client, "tripdocs@test.com")
    trip = _create_trip(client, admin_token, layer["id"]).json()

    response = client.post(
        f"/api/v1/trips/{trip['id']}/documents",
        json={"label": "אישור הורים", "url": "https://example.com/form.pdf"},
        headers=_auth_headers(admin_token),
    )
    assert response.status_code == 201
    doc = response.json()

    detail = client.get(f"/api/v1/trips/{trip['id']}", headers=_auth_headers(admin_token)).json()
    assert len(detail["documents"]) == 1
    assert detail["documents"][0]["label"] == "אישור הורים"

    delete_response = client.delete(
        f"/api/v1/trips/{trip['id']}/documents/{doc['id']}", headers=_auth_headers(admin_token)
    )
    assert delete_response.status_code == 204


def test_schedule_itinerary(client):
    admin_token, _, layer = _make_admin_with_layer(client, "tripschedule@test.com")
    trip = _create_trip(client, admin_token, layer["id"]).json()

    response = client.post(
        f"/api/v1/trips/{trip['id']}/schedule",
        json={"time": "08:00:00", "title": "יציאה מבית הספר"},
        headers=_auth_headers(admin_token),
    )
    assert response.status_code == 201
    item = response.json()
    assert item["time"] == "08:00:00"

    updated = client.patch(
        f"/api/v1/trips/{trip['id']}/schedule/{item['id']}",
        json={"notes": "לוודא שכולם עלו לאוטובוס"},
        headers=_auth_headers(admin_token),
    )
    assert updated.status_code == 200
    assert updated.json()["notes"] == "לוודא שכולם עלו לאוטובוס"

    detail = client.get(f"/api/v1/trips/{trip['id']}", headers=_auth_headers(admin_token)).json()
    assert len(detail["schedule"]) == 1


def test_confirmation_roster_includes_all_active_participants(client):
    admin_token, _, layer = _make_admin_with_layer(client, "tripconfirm@test.com")
    p1 = _create_participant(client, admin_token, layer["id"], "יוסי")
    p2 = _create_participant(client, admin_token, layer["id"], "דנה")
    trip = _create_trip(client, admin_token, layer["id"]).json()

    # Before marking anything, everyone shows up unconfirmed.
    detail = client.get(f"/api/v1/trips/{trip['id']}", headers=_auth_headers(admin_token)).json()
    assert len(detail["confirmations"]) == 2
    assert all(c["confirmed"] is False for c in detail["confirmations"])

    confirm = client.patch(
        f"/api/v1/trips/{trip['id']}/confirmations/{p1['id']}",
        json={"confirmed": True},
        headers=_auth_headers(admin_token),
    )
    assert confirm.status_code == 204

    detail = client.get(f"/api/v1/trips/{trip['id']}", headers=_auth_headers(admin_token)).json()
    by_id = {c["participant_id"]: c["confirmed"] for c in detail["confirmations"]}
    assert by_id[p1["id"]] is True
    assert by_id[p2["id"]] is False

    # Toggling back off works too (re-mark, not just one-way).
    client.patch(
        f"/api/v1/trips/{trip['id']}/confirmations/{p1['id']}",
        json={"confirmed": False},
        headers=_auth_headers(admin_token),
    )
    detail = client.get(f"/api/v1/trips/{trip['id']}", headers=_auth_headers(admin_token)).json()
    assert {c["participant_id"]: c["confirmed"] for c in detail["confirmations"]}[p1["id"]] is False


def test_confirmation_for_participant_in_another_layer_is_rejected(client):
    admin_token, _, layer = _make_admin_with_layer(client, "tripconfirmcross@test.com")
    other_layer = client.post(
        "/api/v1/layers", json={"name": "Layer B"}, headers=_auth_headers(admin_token)
    ).json()
    other_participant = _create_participant(client, admin_token, other_layer["id"])
    trip = _create_trip(client, admin_token, layer["id"]).json()

    response = client.patch(
        f"/api/v1/trips/{trip['id']}/confirmations/{other_participant['id']}",
        json={"confirmed": True},
        headers=_auth_headers(admin_token),
    )

    assert response.status_code == 404


def test_delete_trip_cascades_children(client):
    admin_token, _, layer = _make_admin_with_layer(client, "tripdelete@test.com")
    trip = _create_trip(client, admin_token, layer["id"]).json()
    client.post(
        f"/api/v1/trips/{trip['id']}/equipment", json={"label": "אוהל"}, headers=_auth_headers(admin_token)
    )

    response = client.delete(f"/api/v1/trips/{trip['id']}", headers=_auth_headers(admin_token))
    assert response.status_code == 204

    listed = client.get(f"/api/v1/layers/{layer['id']}/trips", headers=_auth_headers(admin_token))
    assert listed.json() == []


def test_only_manager_can_mutate_trip(client):
    admin_token, _, layer = _make_admin_with_layer(client, "tripmutatemanager@test.com")
    trip = _create_trip(client, admin_token, layer["id"]).json()
    other_token, _ = _register(client, "tripmutateoutsider@test.com")

    response = client.post(
        f"/api/v1/trips/{trip['id']}/equipment", json={"label": "אוהל"}, headers=_auth_headers(other_token)
    )

    assert response.status_code == 404

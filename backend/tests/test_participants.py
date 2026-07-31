# Tests for: listing layers (role-filtered), assigning/unassigning
# counselors, and the participant roster CRUD — including the tenant
# isolation rule that a layer you don't have access to should 404, not 403.


def _register(client, email, password="pass1234", full_name="Test User"):
    response = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "full_name": full_name},
    )
    body = response.json()
    return body["access_token"], body["user"]


def _auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def _make_admin_with_layer(client, admin_email, layer_name="Layer A"):
    admin_token, admin_user = _register(client, admin_email)
    layer = client.post(
        "/api/v1/layers", json={"name": layer_name}, headers=_auth_headers(admin_token)
    ).json()
    return admin_token, admin_user, layer


def test_admin_sees_all_layers_in_their_institution(client):
    admin_token, _, layer_a = _make_admin_with_layer(client, "admin_a@test.com", "Layer A")
    layer_b = client.post(
        "/api/v1/layers", json={"name": "Layer B"}, headers=_auth_headers(admin_token)
    ).json()

    response = client.get("/api/v1/layers", headers=_auth_headers(admin_token))

    assert response.status_code == 200
    ids = {layer["id"] for layer in response.json()}
    assert ids == {layer_a["id"], layer_b["id"]}


def test_counselor_only_sees_assigned_layers(client):
    admin_token, _, layer_a = _make_admin_with_layer(client, "admin_b@test.com", "Layer A")
    client.post("/api/v1/layers", json={"name": "Layer B"}, headers=_auth_headers(admin_token))

    counselor_token, _ = _register(client, "counselor_b@test.com")
    client.post(
        "/api/v1/layers/join",
        json={"join_code": layer_a["join_code"]},
        headers=_auth_headers(counselor_token),
    )

    response = client.get("/api/v1/layers", headers=_auth_headers(counselor_token))

    assert response.status_code == 200
    ids = {layer["id"] for layer in response.json()}
    assert ids == {layer_a["id"]}   # only the layer they joined, not "Layer B"


def test_layer_not_accessible_returns_404_not_403(client):
    _, _, layer_a = _make_admin_with_layer(client, "admin_c@test.com")
    outsider_token, _ = _register(client, "outsider@test.com")

    response = client.get(f"/api/v1/layers/{layer_a['id']}", headers=_auth_headers(outsider_token))

    assert response.status_code == 404


def test_admin_can_assign_and_unassign_counselor(client):
    admin_token, _, layer = _make_admin_with_layer(client, "admin_d@test.com")
    counselor_token, counselor_user = _register(client, "counselor_d@test.com")
    # Counselor must belong to the same institution to be assignable —
    # simplest way here is to join a throwaway layer first via... actually
    # they need SOME layer in this institution to get institution_id set.
    # Use the join-code flow to attach them to the institution first.
    client.post(
        "/api/v1/layers/join",
        json={"join_code": layer["join_code"]},
        headers=_auth_headers(counselor_token),
    )

    # Create a second layer and assign the (already-in-institution) counselor to it.
    layer2 = client.post(
        "/api/v1/layers", json={"name": "Layer 2"}, headers=_auth_headers(admin_token)
    ).json()

    assign_response = client.post(
        f"/api/v1/layers/{layer2['id']}/assign-counselor",
        json={"user_id": counselor_user["id"]},
        headers=_auth_headers(admin_token),
    )
    assert assign_response.status_code == 204

    # Counselor should now see both layers.
    layers = client.get("/api/v1/layers", headers=_auth_headers(counselor_token)).json()
    assert {l["id"] for l in layers} == {layer["id"], layer2["id"]}

    unassign_response = client.delete(
        f"/api/v1/layers/{layer2['id']}/assign-counselor/{counselor_user['id']}",
        headers=_auth_headers(admin_token),
    )
    assert unassign_response.status_code == 204

    layers_after = client.get("/api/v1/layers", headers=_auth_headers(counselor_token)).json()
    assert {l["id"] for l in layers_after} == {layer["id"]}


def test_counselor_cannot_assign_other_counselors(client):
    admin_token, _, layer = _make_admin_with_layer(client, "admin_e@test.com")
    counselor_token, counselor_user = _register(client, "counselor_e@test.com")
    client.post(
        "/api/v1/layers/join",
        json={"join_code": layer["join_code"]},
        headers=_auth_headers(counselor_token),
    )

    response = client.post(
        f"/api/v1/layers/{layer['id']}/assign-counselor",
        json={"user_id": counselor_user["id"]},
        headers=_auth_headers(counselor_token),
    )

    assert response.status_code == 403


def test_participant_roster_crud(client):
    admin_token, _, layer = _make_admin_with_layer(client, "admin_f@test.com")
    headers = _auth_headers(admin_token)

    create_response = client.post(
        f"/api/v1/layers/{layer['id']}/participants",
        json={"full_name": "Yossi Cohen", "guardian_contact": "050-1234567"},
        headers=headers,
    )
    assert create_response.status_code == 201
    participant = create_response.json()
    assert participant["full_name"] == "Yossi Cohen"
    assert participant["is_active"] is True

    list_response = client.get(f"/api/v1/layers/{layer['id']}/participants", headers=headers)
    assert list_response.status_code == 200
    assert len(list_response.json()) == 1

    patch_response = client.patch(
        f"/api/v1/participants/{participant['id']}",
        json={"is_active": False},
        headers=headers,
    )
    assert patch_response.status_code == 200
    assert patch_response.json()["is_active"] is False
    # full_name must be untouched by a PATCH that didn't mention it.
    assert patch_response.json()["full_name"] == "Yossi Cohen"


def test_counselor_can_manage_participants_in_assigned_layer(client):
    admin_token, _, layer = _make_admin_with_layer(client, "admin_g@test.com")
    counselor_token, _ = _register(client, "counselor_g@test.com")
    client.post(
        "/api/v1/layers/join",
        json={"join_code": layer["join_code"]},
        headers=_auth_headers(counselor_token),
    )

    response = client.post(
        f"/api/v1/layers/{layer['id']}/participants",
        json={"full_name": "Dana Levi"},
        headers=_auth_headers(counselor_token),
    )

    assert response.status_code == 201


def test_participant_not_accessible_to_outsider_returns_404(client):
    admin_token, _, layer = _make_admin_with_layer(client, "admin_h@test.com")
    participant = client.post(
        f"/api/v1/layers/{layer['id']}/participants",
        json={"full_name": "Some Kid"},
        headers=_auth_headers(admin_token),
    ).json()

    outsider_token, _ = _register(client, "outsider2@test.com")
    response = client.patch(
        f"/api/v1/participants/{participant['id']}",
        json={"full_name": "Hacked Name"},
        headers=_auth_headers(outsider_token),
    )

    assert response.status_code == 404


def test_blank_participant_name_is_rejected(client):
    admin_token, _, layer = _make_admin_with_layer(client, "admin_i@test.com")

    response = client.post(
        f"/api/v1/layers/{layer['id']}/participants",
        json={"full_name": "   "},
        headers=_auth_headers(admin_token),
    )

    assert response.status_code == 422


def test_admin_can_list_institution_users(client):
    admin_token, _, layer = _make_admin_with_layer(client, "admin_j@test.com")
    counselor_token, counselor_user = _register(client, "counselor_j@test.com")
    client.post(
        "/api/v1/layers/join",
        json={"join_code": layer["join_code"]},
        headers=_auth_headers(counselor_token),
    )

    response = client.get("/api/v1/users", headers=_auth_headers(admin_token))

    assert response.status_code == 200
    emails = {u["email"] for u in response.json()}
    assert emails == {"admin_j@test.com", "counselor_j@test.com"}


def test_counselor_cannot_list_institution_users(client):
    admin_token, _, layer = _make_admin_with_layer(client, "admin_k@test.com")
    counselor_token, _ = _register(client, "counselor_k@test.com")
    client.post(
        "/api/v1/layers/join",
        json={"join_code": layer["join_code"]},
        headers=_auth_headers(counselor_token),
    )

    response = client.get("/api/v1/users", headers=_auth_headers(counselor_token))

    assert response.status_code == 403

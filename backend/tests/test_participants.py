# Tests for: listing layers (view for everyone in the institution,
# manage only for admins/assigned counselors), assigning/unassigning
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


def _make_admin_with_layer(client, admin_email, layer_name="Layer A", institution_name="Test Institution"):
    admin_token, admin_user = _register(client, admin_email)
    layer = client.post(
        "/api/v1/layers",
        json={"name": layer_name, "institution_name": institution_name},
        headers=_auth_headers(admin_token),
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
    assert all(layer["can_manage"] for layer in response.json())  # admin manages everything


def test_counselor_sees_all_institution_layers_but_can_manage_only_assigned(client):
    admin_token, _, layer_a = _make_admin_with_layer(client, "admin_b@test.com", "Layer A")
    layer_b = client.post(
        "/api/v1/layers", json={"name": "Layer B"}, headers=_auth_headers(admin_token)
    ).json()

    counselor_token, _ = _register(client, "counselor_b@test.com")
    client.post(
        "/api/v1/layers/join",
        json={"join_code": layer_a["join_code"]},
        headers=_auth_headers(counselor_token),
    )

    response = client.get("/api/v1/layers", headers=_auth_headers(counselor_token))

    assert response.status_code == 200
    by_id = {layer["id"]: layer for layer in response.json()}
    # Sees BOTH layers in the institution now...
    assert set(by_id.keys()) == {layer_a["id"], layer_b["id"]}
    # ...but can only manage the one they're actually assigned to.
    assert by_id[layer_a["id"]]["can_manage"] is True
    assert by_id[layer_b["id"]]["can_manage"] is False


def test_counselor_can_view_but_not_edit_an_unassigned_layer_in_same_institution(client):
    admin_token, _, layer_a = _make_admin_with_layer(client, "admin_view@test.com", "Layer A")
    layer_b = client.post(
        "/api/v1/layers", json={"name": "Layer B"}, headers=_auth_headers(admin_token)
    ).json()

    counselor_token, _ = _register(client, "counselor_view@test.com")
    client.post(
        "/api/v1/layers/join",
        json={"join_code": layer_a["join_code"]},
        headers=_auth_headers(counselor_token),
    )
    headers = _auth_headers(counselor_token)

    # Can view layer B's detail and (empty) roster read-only.
    get_response = client.get(f"/api/v1/layers/{layer_b['id']}", headers=headers)
    assert get_response.status_code == 200
    assert get_response.json()["can_manage"] is False

    roster_response = client.get(f"/api/v1/layers/{layer_b['id']}/participants", headers=headers)
    assert roster_response.status_code == 200

    # But cannot add a participant to it.
    create_response = client.post(
        f"/api/v1/layers/{layer_b['id']}/participants",
        json={"full_name": "Someone"},
        headers=headers,
    )
    assert create_response.status_code == 404


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

    # Counselor now manages both layers.
    layers = client.get("/api/v1/layers", headers=_auth_headers(counselor_token)).json()
    manageable = {l["id"] for l in layers if l["can_manage"]}
    assert manageable == {layer["id"], layer2["id"]}

    unassign_response = client.delete(
        f"/api/v1/layers/{layer2['id']}/assign-counselor/{counselor_user['id']}",
        headers=_auth_headers(admin_token),
    )
    assert unassign_response.status_code == 204

    layers_after = client.get("/api/v1/layers", headers=_auth_headers(counselor_token)).json()
    manageable_after = {l["id"] for l in layers_after if l["can_manage"]}
    assert manageable_after == {layer["id"]}


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

# Tests for creating layers/groups and joining them by code. These
# also cover the "auto-create an institution" behavior and the
# tenant-isolation rules, since those are the trickiest, most
# important-to-get-right parts of the whole system.


def _register(client, email, password="pass1234", full_name="Test User"):
    response = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "full_name": full_name},
    )
    body = response.json()
    return body["access_token"], body["user"]


def _auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_creating_first_layer_makes_creator_institution_admin(client):
    token, _ = _register(client, "admin@test.com")

    response = client.post(
        "/api/v1/layers",
        json={"name": "Layer Yod-Alef", "description": "test"},
        headers=_auth_headers(token),
    )

    assert response.status_code == 201
    layer = response.json()
    assert layer["name"] == "Layer Yod-Alef"
    assert len(layer["join_code"]) == 6

    # The creator should now be an institution_admin with an institution.
    me = client.get("/api/v1/auth/me", headers=_auth_headers(token)).json()
    assert me["role"] == "institution_admin"
    assert me["institution_id"] == layer["institution_id"]


def test_second_layer_reuses_same_institution(client):
    token, _ = _register(client, "admin2@test.com")
    first = client.post(
        "/api/v1/layers", json={"name": "Layer A"}, headers=_auth_headers(token)
    ).json()
    second = client.post(
        "/api/v1/layers", json={"name": "Layer B"}, headers=_auth_headers(token)
    ).json()

    assert first["institution_id"] == second["institution_id"]
    assert first["join_code"] != second["join_code"]


def test_counselor_can_join_layer_via_code(client):
    admin_token, _ = _register(client, "admin3@test.com")
    layer = client.post(
        "/api/v1/layers", json={"name": "Layer C"}, headers=_auth_headers(admin_token)
    ).json()

    counselor_token, _ = _register(client, "counselor@test.com")
    response = client.post(
        "/api/v1/layers/join",
        json={"join_code": layer["join_code"]},
        headers=_auth_headers(counselor_token),
    )

    assert response.status_code == 200
    assert response.json()["id"] == layer["id"]

    me = client.get("/api/v1/auth/me", headers=_auth_headers(counselor_token)).json()
    assert me["role"] == "counselor"
    assert me["institution_id"] == layer["institution_id"]


def test_joining_with_invalid_code_returns_404(client):
    token, _ = _register(client, "someone@test.com")

    response = client.post(
        "/api/v1/layers/join",
        json={"join_code": "NOPE99"},
        headers=_auth_headers(token),
    )

    assert response.status_code == 404


def test_joining_same_layer_twice_does_not_duplicate_assignment(client):
    admin_token, _ = _register(client, "admin4@test.com")
    layer = client.post(
        "/api/v1/layers", json={"name": "Layer D"}, headers=_auth_headers(admin_token)
    ).json()

    counselor_token, _ = _register(client, "counselor2@test.com")
    headers = _auth_headers(counselor_token)
    first = client.post("/api/v1/layers/join", json={"join_code": layer["join_code"]}, headers=headers)
    second = client.post("/api/v1/layers/join", json={"join_code": layer["join_code"]}, headers=headers)

    assert first.status_code == 200
    assert second.status_code == 200  # joining again is a no-op, not an error


def test_user_cannot_join_layer_in_a_different_institution(client):
    # Counselor first joins institution A.
    admin_a_token, _ = _register(client, "admin_a@test.com")
    layer_a = client.post(
        "/api/v1/layers", json={"name": "Layer A"}, headers=_auth_headers(admin_a_token)
    ).json()
    counselor_token, _ = _register(client, "counselor3@test.com")
    client.post(
        "/api/v1/layers/join",
        json={"join_code": layer_a["join_code"]},
        headers=_auth_headers(counselor_token),
    )

    # Now a second, unrelated institution exists with its own layer.
    admin_b_token, _ = _register(client, "admin_b@test.com")
    layer_b = client.post(
        "/api/v1/layers", json={"name": "Layer B"}, headers=_auth_headers(admin_b_token)
    ).json()

    # The counselor (already in institution A) tries to join institution B's layer.
    response = client.post(
        "/api/v1/layers/join",
        json={"join_code": layer_b["join_code"]},
        headers=_auth_headers(counselor_token),
    )

    assert response.status_code == 403


def test_blank_layer_name_is_rejected(client):
    token, _ = _register(client, "blankname@test.com")

    response = client.post(
        "/api/v1/layers", json={"name": "   "}, headers=_auth_headers(token)
    )

    assert response.status_code == 422


def test_duplicate_layer_name_in_same_institution_is_rejected_cleanly(client):
    admin_token, _ = _register(client, "admin6@test.com")
    headers = _auth_headers(admin_token)
    first = client.post("/api/v1/layers", json={"name": "Same Name"}, headers=headers)
    second = client.post("/api/v1/layers", json={"name": "Same Name"}, headers=headers)

    assert first.status_code == 201
    assert second.status_code == 400  # not a 500 crash


def test_counselor_cannot_create_additional_layers(client):
    admin_token, _ = _register(client, "admin5@test.com")
    layer = client.post(
        "/api/v1/layers", json={"name": "Layer E"}, headers=_auth_headers(admin_token)
    ).json()

    counselor_token, _ = _register(client, "counselor4@test.com")
    client.post(
        "/api/v1/layers/join",
        json={"join_code": layer["join_code"]},
        headers=_auth_headers(counselor_token),
    )

    response = client.post(
        "/api/v1/layers",
        json={"name": "Layer F"},
        headers=_auth_headers(counselor_token),
    )

    assert response.status_code == 403

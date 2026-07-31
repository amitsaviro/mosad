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


def _create_layer(client, token, name, description=None, institution_name="Test Institution"):
    """institution_name only matters (and is required) the very first
    time a user creates a layer — it's ignored on subsequent calls once
    they already belong to an institution, so it's safe to always pass
    a default here."""
    payload = {"name": name}
    if description is not None:
        payload["description"] = description
    payload["institution_name"] = institution_name
    return client.post("/api/v1/layers", json=payload, headers=_auth_headers(token))


def test_creating_first_layer_makes_creator_institution_admin(client):
    token, _ = _register(client, "admin@test.com")

    response = _create_layer(client, token, "Layer Yod-Alef", description="test", institution_name="Beit Kama")

    assert response.status_code == 201
    layer = response.json()
    assert layer["name"] == "Layer Yod-Alef"
    assert len(layer["join_code"]) == 6
    assert layer["can_manage"] is True

    # The creator should now be an institution_admin with an institution.
    me = client.get("/api/v1/auth/me", headers=_auth_headers(token)).json()
    assert me["role"] == "institution_admin"
    assert me["institution_id"] == layer["institution_id"]
    assert me["institution_name"] == "Beit Kama"


def test_first_layer_without_institution_name_is_rejected(client):
    token, _ = _register(client, "noname@test.com")

    response = client.post(
        "/api/v1/layers", json={"name": "Layer A"}, headers=_auth_headers(token)
    )

    assert response.status_code == 400


def test_second_layer_reuses_same_institution(client):
    token, _ = _register(client, "admin2@test.com")
    first = _create_layer(client, token, "Layer A").json()
    second = _create_layer(client, token, "Layer B").json()

    assert first["institution_id"] == second["institution_id"]
    assert first["join_code"] != second["join_code"]


def test_counselor_can_join_layer_via_code(client):
    admin_token, _ = _register(client, "admin3@test.com")
    layer = _create_layer(client, admin_token, "Layer C").json()

    counselor_token, _ = _register(client, "counselor@test.com")
    response = client.post(
        "/api/v1/layers/join",
        json={"join_code": layer["join_code"]},
        headers=_auth_headers(counselor_token),
    )

    assert response.status_code == 200
    assert response.json()["id"] == layer["id"]
    assert response.json()["can_manage"] is True   # assigned counselor -> can manage

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
    layer = _create_layer(client, admin_token, "Layer D").json()

    counselor_token, _ = _register(client, "counselor2@test.com")
    headers = _auth_headers(counselor_token)
    first = client.post("/api/v1/layers/join", json={"join_code": layer["join_code"]}, headers=headers)
    second = client.post("/api/v1/layers/join", json={"join_code": layer["join_code"]}, headers=headers)

    assert first.status_code == 200
    assert second.status_code == 200  # joining again is a no-op, not an error


def test_user_cannot_join_layer_in_a_different_institution(client):
    # Counselor first joins institution A.
    admin_a_token, _ = _register(client, "admin_a@test.com")
    layer_a = _create_layer(client, admin_a_token, "Layer A").json()
    counselor_token, _ = _register(client, "counselor3@test.com")
    client.post(
        "/api/v1/layers/join",
        json={"join_code": layer_a["join_code"]},
        headers=_auth_headers(counselor_token),
    )

    # Now a second, unrelated institution exists with its own layer.
    admin_b_token, _ = _register(client, "admin_b@test.com")
    layer_b = _create_layer(client, admin_b_token, "Layer B").json()

    # The counselor (already in institution A) tries to join institution B's layer.
    response = client.post(
        "/api/v1/layers/join",
        json={"join_code": layer_b["join_code"]},
        headers=_auth_headers(counselor_token),
    )

    assert response.status_code == 403


def test_hebrew_names_round_trip_correctly(client):
    # Target audience writes Hebrew, not English — make sure nothing
    # (Postgres encoding, JSON handling, our own code) mangles it.
    token, user = _register(client, "hebrew@test.com", full_name="עמית סביר")
    assert user["full_name"] == "עמית סביר"

    layer = _create_layer(
        client,
        token,
        "שכבת יוד-אלף",
        description="קבוצת נוער בוגר, גילאי 16-17",
        institution_name="חינוך בית קמה",
    ).json()
    assert layer["name"] == "שכבת יוד-אלף"
    assert layer["description"] == "קבוצת נוער בוגר, גילאי 16-17"

    me = client.get("/api/v1/auth/me", headers=_auth_headers(token)).json()
    assert me["full_name"] == "עמית סביר"
    assert me["institution_name"] == "חינוך בית קמה"


def test_blank_layer_name_is_rejected(client):
    token, _ = _register(client, "blankname@test.com")

    response = _create_layer(client, token, "   ")

    assert response.status_code == 422


def test_duplicate_layer_name_in_same_institution_is_rejected_cleanly(client):
    admin_token, _ = _register(client, "admin6@test.com")
    first = _create_layer(client, admin_token, "Same Name")
    second = _create_layer(client, admin_token, "Same Name")

    assert first.status_code == 201
    assert second.status_code == 400  # not a 500 crash


def test_counselor_cannot_create_additional_layers(client):
    admin_token, _ = _register(client, "admin5@test.com")
    layer = _create_layer(client, admin_token, "Layer E").json()

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

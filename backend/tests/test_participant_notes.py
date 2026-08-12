# Tests for the note history on a participant: create/list, view vs.
# manage permission split, and deletion by any layer manager (not just
# the note's original author).


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


def test_create_and_list_notes(client):
    admin_token, _, layer = _make_admin_with_layer(client, "noteadmin@test.com")
    participant = _create_participant(client, admin_token, layer["id"])

    response = client.post(
        f"/api/v1/participants/{participant['id']}/notes",
        json={"body": "התקשה בפעילות היום"},
        headers=_auth_headers(admin_token),
    )

    assert response.status_code == 201
    note = response.json()
    assert note["body"] == "התקשה בפעילות היום"
    assert note["author_name"] == "Test User"

    listed = client.get(
        f"/api/v1/participants/{participant['id']}/notes", headers=_auth_headers(admin_token)
    )
    assert listed.status_code == 200
    assert len(listed.json()) == 1


def test_only_manager_can_add_note(client):
    admin_token, _, layer = _make_admin_with_layer(client, "notemanager@test.com")
    participant = _create_participant(client, admin_token, layer["id"])
    outsider_token, _ = _register(client, "noteoutsider@test.com")

    response = client.post(
        f"/api/v1/participants/{participant['id']}/notes",
        json={"body": "note"},
        headers=_auth_headers(outsider_token),
    )

    assert response.status_code == 404


def test_view_only_counselor_can_list_but_not_add_notes(client):
    admin_token, _, layer_a = _make_admin_with_layer(client, "noteviewadmin@test.com", "Layer A")
    layer_b = client.post(
        "/api/v1/layers", json={"name": "Layer B"}, headers=_auth_headers(admin_token)
    ).json()
    participant = _create_participant(client, admin_token, layer_b["id"])

    counselor_token, _ = _register(client, "noteviewcounselor@test.com")
    client.post(
        "/api/v1/layers/join", json={"join_code": layer_a["join_code"]}, headers=_auth_headers(counselor_token)
    )

    listed = client.get(
        f"/api/v1/participants/{participant['id']}/notes", headers=_auth_headers(counselor_token)
    )
    assert listed.status_code == 200

    create_response = client.post(
        f"/api/v1/participants/{participant['id']}/notes",
        json={"body": "not allowed"},
        headers=_auth_headers(counselor_token),
    )
    assert create_response.status_code == 404


def test_blank_note_is_rejected(client):
    admin_token, _, layer = _make_admin_with_layer(client, "noteblank@test.com")
    participant = _create_participant(client, admin_token, layer["id"])

    response = client.post(
        f"/api/v1/participants/{participant['id']}/notes",
        json={"body": "   "},
        headers=_auth_headers(admin_token),
    )

    assert response.status_code == 422


def test_any_layer_manager_can_delete_a_note_not_just_the_author(client):
    admin_token, _, layer = _make_admin_with_layer(client, "notedeleteadmin@test.com")
    participant = _create_participant(client, admin_token, layer["id"])
    counselor_token, _ = _register(client, "notedeletecounselor@test.com")
    client.post(
        "/api/v1/layers/join", json={"join_code": layer["join_code"]}, headers=_auth_headers(counselor_token)
    )

    note = client.post(
        f"/api/v1/participants/{participant['id']}/notes",
        json={"body": "written by admin"},
        headers=_auth_headers(admin_token),
    ).json()

    # The assigned counselor (not the author) deletes it.
    response = client.delete(f"/api/v1/notes/{note['id']}", headers=_auth_headers(counselor_token))
    assert response.status_code == 204

    listed = client.get(
        f"/api/v1/participants/{participant['id']}/notes", headers=_auth_headers(admin_token)
    ).json()
    assert listed == []


def test_note_not_accessible_to_outsider_returns_404(client):
    admin_token, _, layer = _make_admin_with_layer(client, "notedeleteoutsider@test.com")
    participant = _create_participant(client, admin_token, layer["id"])
    note = client.post(
        f"/api/v1/participants/{participant['id']}/notes",
        json={"body": "secret"},
        headers=_auth_headers(admin_token),
    ).json()

    outsider_token, _ = _register(client, "notedeleteoutsider2@test.com")
    response = client.delete(f"/api/v1/notes/{note['id']}", headers=_auth_headers(outsider_token))

    assert response.status_code == 404

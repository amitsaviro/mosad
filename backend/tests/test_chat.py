# Tests for a layer's team chat: posting, listing, cross-layer
# isolation, permission split (view vs. post), and unread-count tracking.


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


def _send(client, token, layer_id, body):
    return client.post(f"/api/v1/layers/{layer_id}/chat/messages", json={"body": body}, headers=_auth_headers(token))


def test_post_and_list_messages(client):
    admin_token, admin_user, layer = _make_admin_with_layer(client, "chatadmin@test.com")

    response = _send(client, admin_token, layer["id"], "שלום לכולם")

    assert response.status_code == 201
    message = response.json()
    assert message["body"] == "שלום לכולם"
    assert message["author_name"] == admin_user["full_name"]

    listed = client.get(f"/api/v1/layers/{layer['id']}/chat/messages", headers=_auth_headers(admin_token))
    assert listed.status_code == 200
    assert len(listed.json()) == 1


def test_only_manager_can_post(client):
    admin_token, _, layer = _make_admin_with_layer(client, "chatpostmanager@test.com")
    other_token, _ = _register(client, "chatpostoutsider@test.com")

    response = _send(client, other_token, layer["id"], "הודעה")

    assert response.status_code == 404


def test_any_institution_member_can_view_but_only_manager_can_post(client):
    admin_token, _, layer = _make_admin_with_layer(client, "chatviewadmin@test.com")
    other_layer = client.post(
        "/api/v1/layers", json={"name": "Layer B"}, headers=_auth_headers(admin_token)
    ).json()
    counselor_token, _ = _register(client, "chatviewcounselor@test.com")
    client.post(
        "/api/v1/layers/join", json={"join_code": other_layer["join_code"]}, headers=_auth_headers(counselor_token)
    )

    _send(client, admin_token, layer["id"], "הודעה מהמנהל")

    listed = client.get(f"/api/v1/layers/{layer['id']}/chat/messages", headers=_auth_headers(counselor_token))
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    post_attempt = _send(client, counselor_token, layer["id"], "לא אמור לעבוד")
    assert post_attempt.status_code == 404


def test_messages_are_isolated_per_layer(client):
    admin_token, _, layer_a = _make_admin_with_layer(client, "chatlayer1@test.com", "Layer A")
    layer_b = client.post(
        "/api/v1/layers", json={"name": "Layer B"}, headers=_auth_headers(admin_token)
    ).json()

    _send(client, admin_token, layer_a["id"], "הודעה בשכבה א")

    listed_a = client.get(f"/api/v1/layers/{layer_a['id']}/chat/messages", headers=_auth_headers(admin_token)).json()
    listed_b = client.get(f"/api/v1/layers/{layer_b['id']}/chat/messages", headers=_auth_headers(admin_token)).json()
    assert len(listed_a) == 1
    assert len(listed_b) == 0


def test_counselor_assigned_to_layer_can_post(client):
    admin_token, _, layer = _make_admin_with_layer(client, "chatlayeradmin@test.com")
    counselor_token, counselor_user = _register(client, "chatcounselor@test.com")
    client.post(
        "/api/v1/layers/join", json={"join_code": layer["join_code"]}, headers=_auth_headers(counselor_token)
    )

    response = _send(client, counselor_token, layer["id"], "הודעה מהמדריך")
    assert response.status_code == 201

    listed = client.get(f"/api/v1/layers/{layer['id']}/chat/messages", headers=_auth_headers(admin_token)).json()
    assert len(listed) == 1
    assert listed[0]["author_name"] == counselor_user["full_name"]


def test_unread_count_tracks_last_read(client):
    admin_token, _, layer = _make_admin_with_layer(client, "chatunreadadmin@test.com")
    counselor_token, _ = _register(client, "chatunreadcounselor@test.com")
    client.post(
        "/api/v1/layers/join", json={"join_code": layer["join_code"]}, headers=_auth_headers(counselor_token)
    )

    # Never read yet -- messages from someone else are unread; own
    # messages never count against yourself.
    _send(client, admin_token, layer["id"], "הודעה 1")
    unread = client.get(
        f"/api/v1/layers/{layer['id']}/chat/unread-count", headers=_auth_headers(counselor_token)
    ).json()
    assert unread["count"] == 1

    own_unread = client.get(
        f"/api/v1/layers/{layer['id']}/chat/unread-count", headers=_auth_headers(admin_token)
    ).json()
    assert own_unread["count"] == 0

    mark = client.post(f"/api/v1/layers/{layer['id']}/chat/mark-read", headers=_auth_headers(counselor_token))
    assert mark.status_code == 204

    after_read = client.get(
        f"/api/v1/layers/{layer['id']}/chat/unread-count", headers=_auth_headers(counselor_token)
    ).json()
    assert after_read["count"] == 0

    _send(client, admin_token, layer["id"], "הודעה 2")
    after_new_message = client.get(
        f"/api/v1/layers/{layer['id']}/chat/unread-count", headers=_auth_headers(counselor_token)
    ).json()
    assert after_new_message["count"] == 1


def test_unread_count_is_per_layer(client):
    admin_token, _, layer_a = _make_admin_with_layer(client, "chatperlayer@test.com", "Layer A")
    layer_b = client.post(
        "/api/v1/layers", json={"name": "Layer B"}, headers=_auth_headers(admin_token)
    ).json()
    counselor_token, _ = _register(client, "chatperlayercounselor@test.com")
    client.post(
        "/api/v1/layers/join", json={"join_code": layer_a["join_code"]}, headers=_auth_headers(counselor_token)
    )
    client.post(
        "/api/v1/layers/join", json={"join_code": layer_b["join_code"]}, headers=_auth_headers(counselor_token)
    )

    _send(client, admin_token, layer_a["id"], "רק בשכבה א")
    client.post(f"/api/v1/layers/{layer_b['id']}/chat/mark-read", headers=_auth_headers(counselor_token))

    unread_a = client.get(
        f"/api/v1/layers/{layer_a['id']}/chat/unread-count", headers=_auth_headers(counselor_token)
    ).json()
    unread_b = client.get(
        f"/api/v1/layers/{layer_b['id']}/chat/unread-count", headers=_auth_headers(counselor_token)
    ).json()
    assert unread_a["count"] == 1
    assert unread_b["count"] == 0

# Tests for the private "ask the creator" thread on a repository
# activity: a non-creator can only talk to the creator (implicit
# recipient), the creator can have several separate asker threads and
# must pick which one to reply to, and threads stay isolated.


def _register(client, email, password="pass1234", full_name="Test User"):
    response = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "full_name": full_name},
    )
    body = response.json()
    return body["access_token"], body["user"]


def _auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def _create_activity(client, token, **overrides):
    payload = {
        "name": "טיול שנתי",
        "description": "יום כיף בטבע",
        "activity_type": "main",
    }
    payload.update(overrides)
    return client.post("/api/v1/activities", json=payload, headers=_auth_headers(token)).json()


def test_asker_sends_message_implicitly_to_creator(client):
    creator_token, creator_user = _register(client, "msgcreator@test.com")
    activity = _create_activity(client, creator_token)
    asker_token, asker_user = _register(client, "msgasker@test.com")

    response = client.post(
        f"/api/v1/activities/{activity['id']}/messages",
        json={"body": "כמה זמן לוקחת הפעילות בפועל?"},
        headers=_auth_headers(asker_token),
    )

    assert response.status_code == 201
    message = response.json()
    assert message["sender_name"] == asker_user["full_name"]
    assert message["recipient_id"] == creator_user["id"]


def test_asker_and_creator_see_the_same_thread(client):
    creator_token, creator_user = _register(client, "msgthreadcreator@test.com")
    activity = _create_activity(client, creator_token)
    asker_token, asker_user = _register(client, "msgthreadasker@test.com")

    client.post(
        f"/api/v1/activities/{activity['id']}/messages",
        json={"body": "שאלה ראשונה"},
        headers=_auth_headers(asker_token),
    )
    client.post(
        f"/api/v1/activities/{activity['id']}/messages",
        json={"body": "תשובה", "to_user_id": asker_user["id"]},
        headers=_auth_headers(creator_token),
    )

    asker_view = client.get(f"/api/v1/activities/{activity['id']}/messages", headers=_auth_headers(asker_token))
    creator_view = client.get(
        f"/api/v1/activities/{activity['id']}/messages?with={asker_user['id']}",
        headers=_auth_headers(creator_token),
    )

    assert asker_view.status_code == 200
    assert len(asker_view.json()) == 2
    assert creator_view.status_code == 200
    assert len(creator_view.json()) == 2
    assert asker_view.json()[0]["body"] == "שאלה ראשונה"
    assert asker_view.json()[1]["body"] == "תשובה"


def test_creator_reply_requires_to_user_id(client):
    creator_token, _ = _register(client, "msgnotarget@test.com")
    activity = _create_activity(client, creator_token)

    response = client.post(
        f"/api/v1/activities/{activity['id']}/messages",
        json={"body": "לענות למי?"},
        headers=_auth_headers(creator_token),
    )

    assert response.status_code == 400


def test_creator_sees_separate_threads_per_asker(client):
    creator_token, _ = _register(client, "msgmultiaskercreator@test.com")
    activity = _create_activity(client, creator_token)
    asker1_token, asker1_user = _register(client, "msgasker1@test.com")
    asker2_token, asker2_user = _register(client, "msgasker2@test.com")

    client.post(
        f"/api/v1/activities/{activity['id']}/messages",
        json={"body": "שאלה מהראשון"},
        headers=_auth_headers(asker1_token),
    )
    client.post(
        f"/api/v1/activities/{activity['id']}/messages",
        json={"body": "שאלה מהשני"},
        headers=_auth_headers(asker2_token),
    )

    threads = client.get(
        f"/api/v1/activities/{activity['id']}/messages/threads", headers=_auth_headers(creator_token)
    )
    assert threads.status_code == 200
    thread_ids = {t["other_user_id"] for t in threads.json()}
    assert thread_ids == {asker1_user["id"], asker2_user["id"]}

    only_asker1 = client.get(
        f"/api/v1/activities/{activity['id']}/messages?with={asker1_user['id']}",
        headers=_auth_headers(creator_token),
    ).json()
    assert len(only_asker1) == 1
    assert only_asker1[0]["body"] == "שאלה מהראשון"


def test_only_creator_can_view_threads_list(client):
    creator_token, _ = _register(client, "msgthreadslistcreator@test.com")
    activity = _create_activity(client, creator_token)
    other_token, _ = _register(client, "msgthreadslistother@test.com")

    response = client.get(
        f"/api/v1/activities/{activity['id']}/messages/threads", headers=_auth_headers(other_token)
    )

    assert response.status_code == 403


def test_cannot_message_self(client):
    creator_token, creator_user = _register(client, "msgself@test.com")
    activity = _create_activity(client, creator_token)

    response = client.post(
        f"/api/v1/activities/{activity['id']}/messages",
        json={"body": "היי אני", "to_user_id": creator_user["id"]},
        headers=_auth_headers(creator_token),
    )

    assert response.status_code == 400

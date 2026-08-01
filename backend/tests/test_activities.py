# Tests for the nationwide activity repository: CRUD (creator-only
# edit/delete), search/filter, ratings, and comments. Deliberately NOT
# institution-scoped -- any logged-in user can see/create activities.


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
    return client.post("/api/v1/activities", json=payload, headers=_auth_headers(token))


def test_create_and_get_activity(client):
    token, _ = _register(client, "creator@test.com", full_name="יוצר הפעילות")

    response = _create_activity(
        client,
        token,
        age_min=10,
        age_max=14,
        duration_minutes=30,
        group_size_min=5,
        group_size_max=30,
        location="חוץ",
        required_equipment="כדור, קונוסים",
        budget_estimate=15.5,
        tags=["קיץ", "ספורט"],
        attachments=[{"url": "https://example.com/song.mp3", "label": "שיר לפעילות"}],
    )

    assert response.status_code == 201
    activity = response.json()
    assert activity["name"] == "משחק פתיחה כיפי"
    assert activity["creator_name"] == "יוצר הפעילות"
    assert activity["tags"] == ["קיץ", "ספורט"]
    assert len(activity["attachments"]) == 1
    assert activity["average_rating"] is None
    assert activity["usage_count"] == 0
    assert activity["can_manage"] is True

    get_response = client.get(f"/api/v1/activities/{activity['id']}", headers=_auth_headers(token))
    assert get_response.status_code == 200
    assert get_response.json()["name"] == "משחק פתיחה כיפי"


def test_blank_activity_name_is_rejected(client):
    token, _ = _register(client, "blankact@test.com")

    response = _create_activity(client, token, name="   ")

    assert response.status_code == 422


def test_any_user_can_see_any_activity_not_institution_scoped(client):
    creator_token, _ = _register(client, "creator2@test.com")
    activity = _create_activity(client, creator_token).json()

    other_token, _ = _register(client, "other@test.com")
    response = client.get("/api/v1/activities", headers=_auth_headers(other_token))

    assert response.status_code == 200
    ids = {a["id"] for a in response.json()}
    assert activity["id"] in ids
    # can_manage is per-viewer -- the non-creator shouldn't be able to edit.
    other_view = next(a for a in response.json() if a["id"] == activity["id"])
    assert other_view["can_manage"] is False


def test_only_creator_can_update_activity(client):
    creator_token, _ = _register(client, "creator3@test.com")
    activity = _create_activity(client, creator_token).json()
    other_token, _ = _register(client, "other2@test.com")

    forbidden = client.patch(
        f"/api/v1/activities/{activity['id']}",
        json={"name": "שם חדש"},
        headers=_auth_headers(other_token),
    )
    assert forbidden.status_code == 403

    allowed = client.patch(
        f"/api/v1/activities/{activity['id']}",
        json={"name": "שם חדש"},
        headers=_auth_headers(creator_token),
    )
    assert allowed.status_code == 200
    assert allowed.json()["name"] == "שם חדש"


def test_only_creator_can_delete_activity(client):
    creator_token, _ = _register(client, "creator4@test.com")
    activity = _create_activity(client, creator_token).json()
    other_token, _ = _register(client, "other3@test.com")

    forbidden = client.delete(
        f"/api/v1/activities/{activity['id']}", headers=_auth_headers(other_token)
    )
    assert forbidden.status_code == 403

    allowed = client.delete(
        f"/api/v1/activities/{activity['id']}", headers=_auth_headers(creator_token)
    )
    assert allowed.status_code == 204

    get_after = client.get(f"/api/v1/activities/{activity['id']}", headers=_auth_headers(creator_token))
    assert get_after.status_code == 404


def test_search_filters_by_text(client):
    token, _ = _register(client, "searchuser@test.com")
    _create_activity(client, token, name="ציד אוצר בטבע")
    _create_activity(client, token, name="משחק כדורגל")

    response = client.get("/api/v1/activities?search=אוצר", headers=_auth_headers(token))

    assert response.status_code == 200
    names = {a["name"] for a in response.json()}
    assert names == {"ציד אוצר בטבע"}


def test_filter_by_activity_type_and_tag(client):
    token, _ = _register(client, "filteruser@test.com")
    _create_activity(client, token, name="פתיחה א", activity_type="opener", tags=["חנוכה"])
    _create_activity(client, token, name="מרכזית א", activity_type="main", tags=["חנוכה"])
    _create_activity(client, token, name="פתיחה ב", activity_type="opener", tags=["קיץ"])

    response = client.get(
        "/api/v1/activities?activity_type=opener&tag=חנוכה", headers=_auth_headers(token)
    )

    assert response.status_code == 200
    names = {a["name"] for a in response.json()}
    assert names == {"פתיחה א"}


def test_filter_by_age_range(client):
    token, _ = _register(client, "ageuser@test.com")
    _create_activity(client, token, name="לגילאי 8-10", age_min=8, age_max=10)
    _create_activity(client, token, name="לכל הגילאים")  # no age restriction
    _create_activity(client, token, name="לגילאי 15-18", age_min=15, age_max=18)

    response = client.get("/api/v1/activities?age=9", headers=_auth_headers(token))

    assert response.status_code == 200
    names = {a["name"] for a in response.json()}
    assert names == {"לגילאי 8-10", "לכל הגילאים"}


def test_add_rating_and_average_computed(client):
    admin_token, _, layer = _make_admin_with_layer(client, "rateradmin@test.com")
    activity = _create_activity(client, admin_token).json()

    first = client.post(
        f"/api/v1/activities/{activity['id']}/ratings",
        json={"layer_id": layer["id"], "rating": 4, "notes": "עבד טוב"},
        headers=_auth_headers(admin_token),
    )
    assert first.status_code == 201

    second = client.post(
        f"/api/v1/activities/{activity['id']}/ratings",
        json={"layer_id": layer["id"], "rating": 2},
        headers=_auth_headers(admin_token),
    )
    assert second.status_code == 201

    detail = client.get(f"/api/v1/activities/{activity['id']}", headers=_auth_headers(admin_token)).json()
    assert detail["usage_count"] == 2
    assert detail["average_rating"] == 3.0

    ratings = client.get(
        f"/api/v1/activities/{activity['id']}/ratings", headers=_auth_headers(admin_token)
    ).json()
    assert len(ratings) == 2
    assert ratings[0]["layer_name"] == layer["name"]


def test_rating_out_of_range_is_rejected(client):
    admin_token, _, layer = _make_admin_with_layer(client, "badratingadmin@test.com")
    activity = _create_activity(client, admin_token).json()

    response = client.post(
        f"/api/v1/activities/{activity['id']}/ratings",
        json={"layer_id": layer["id"], "rating": 7},
        headers=_auth_headers(admin_token),
    )

    assert response.status_code == 422


def test_add_and_list_comments(client):
    creator_token, _ = _register(client, "commentcreator@test.com")
    activity = _create_activity(client, creator_token).json()
    asker_token, _ = _register(client, "asker@test.com", full_name="שואל השאלה")

    add_response = client.post(
        f"/api/v1/activities/{activity['id']}/comments",
        json={"body": "האם זה עובד גם בפנים?"},
        headers=_auth_headers(asker_token),
    )
    assert add_response.status_code == 201
    assert add_response.json()["user_name"] == "שואל השאלה"

    list_response = client.get(
        f"/api/v1/activities/{activity['id']}/comments", headers=_auth_headers(asker_token)
    )
    assert list_response.status_code == 200
    assert len(list_response.json()) == 1
    assert list_response.json()[0]["body"] == "האם זה עובד גם בפנים?"


def test_blank_comment_is_rejected(client):
    token, _ = _register(client, "blankcomment@test.com")
    activity = _create_activity(client, token).json()

    response = client.post(
        f"/api/v1/activities/{activity['id']}/comments",
        json={"body": "   "},
        headers=_auth_headers(token),
    )

    assert response.status_code == 422


def test_hebrew_activity_fields_round_trip(client):
    token, _ = _register(client, "hebrewactivity@test.com")

    response = _create_activity(
        client,
        token,
        name="משחק חבל בשלג",
        description="פעילות חורף מהנה עם חבלים",
        location="בחוץ בשלג",
        required_equipment="חבלים, כפפות",
        tags=["חורף", "שלג"],
    )

    assert response.status_code == 201
    activity = response.json()
    assert activity["name"] == "משחק חבל בשלג"
    assert activity["location"] == "בחוץ בשלג"
    assert activity["tags"] == ["חורף", "שלג"]

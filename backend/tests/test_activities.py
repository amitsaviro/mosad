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
        grade_min=3,
        grade_max=6,
        duration_minutes=30,
        group_size_min=5,
        group_size_max=30,
        location="outdoor",
        equipment=["כדור", "קונוסים"],
        budget_estimate=15.5,
        tags=["קיץ", "ספורט"],
        categories=["sports", "team_building"],
        contact_phone="050-1234567",
        attachments=[{"url": "https://example.com/song.mp3", "label": "שיר לפעילות"}],
    )

    assert response.status_code == 201
    activity = response.json()
    assert activity["name"] == "משחק פתיחה כיפי"
    assert activity["creator_name"] == "יוצר הפעילות"
    assert activity["tags"] == ["קיץ", "ספורט"]
    assert activity["equipment"] == ["כדור", "קונוסים"]
    assert set(activity["categories"]) == {"sports", "team_building"}
    assert activity["contact_phone"] == "050-1234567"
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
    ids = {a["id"] for a in response.json()["items"]}
    assert activity["id"] in ids
    # can_manage is per-viewer -- the non-creator shouldn't be able to edit.
    other_view = next(a for a in response.json()["items"] if a["id"] == activity["id"])
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
    names = {a["name"] for a in response.json()["items"]}
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
    names = {a["name"] for a in response.json()["items"]}
    assert names == {"פתיחה א"}


def test_filter_by_category(client):
    token, _ = _register(client, "categoryuser@test.com")
    _create_activity(client, token, name="ספורט", categories=["sports"])
    _create_activity(client, token, name="גיבוש", categories=["team_building"])
    _create_activity(client, token, name="סדנה", categories=["workshop"])

    response = client.get(
        "/api/v1/activities?category=sports&category=team_building", headers=_auth_headers(token)
    )

    assert response.status_code == 200
    names = {a["name"] for a in response.json()["items"]}
    assert names == {"ספורט", "גיבוש"}


def test_filter_by_location(client):
    token, _ = _register(client, "locationuser@test.com")
    _create_activity(client, token, name="בחוץ", location="outdoor")
    _create_activity(client, token, name="באולם", location="sports_hall")

    response = client.get("/api/v1/activities?location=outdoor", headers=_auth_headers(token))

    assert response.status_code == 200
    names = {a["name"] for a in response.json()["items"]}
    assert names == {"בחוץ"}


def test_filter_by_grade_point(client):
    token, _ = _register(client, "gradeuser@test.com")
    _create_activity(client, token, name="לשכבות ג-ד", grade_min=3, grade_max=4)
    _create_activity(client, token, name="לכל השכבות")  # no grade restriction
    _create_activity(client, token, name="לשכבות ט-יב", grade_min=9, grade_max=12)

    response = client.get("/api/v1/activities?grade_min=4&grade_max=4", headers=_auth_headers(token))

    assert response.status_code == 200
    names = {a["name"] for a in response.json()["items"]}
    assert names == {"לשכבות ג-ד", "לכל השכבות"}


def test_filter_by_grade_range_overlap(client):
    token, _ = _register(client, "gradeoverlapuser@test.com")
    _create_activity(client, token, name="לשכבות ג-ד", grade_min=3, grade_max=4)
    _create_activity(client, token, name="לכל השכבות")  # no grade restriction
    _create_activity(client, token, name="לשכבות ט-יב", grade_min=9, grade_max=12)
    _create_activity(client, token, name="לשכבות ה-ז", grade_min=5, grade_max=7)

    # Filtering for "ט-יב" should match activities whose OWN range
    # overlaps that window at all, not just an exact match.
    response = client.get("/api/v1/activities?grade_min=9&grade_max=12", headers=_auth_headers(token))

    assert response.status_code == 200
    names = {a["name"] for a in response.json()["items"]}
    assert names == {"לשכבות ט-יב", "לכל השכבות"}


def test_filter_by_grade_min_only_is_open_ended(client):
    token, _ = _register(client, "gradeopenuser@test.com")
    _create_activity(client, token, name="לשכבות ג-ד", grade_min=3, grade_max=4)
    _create_activity(client, token, name="לשכבות ט-יב", grade_min=9, grade_max=12)
    _create_activity(client, token, name="לכל השכבות")

    # "ט ומעלה" -- only grade_min given, so the upper side is unbounded.
    response = client.get("/api/v1/activities?grade_min=9", headers=_auth_headers(token))

    assert response.status_code == 200
    names = {a["name"] for a in response.json()["items"]}
    assert names == {"לשכבות ט-יב", "לכל השכבות"}


def test_grade_max_below_min_is_rejected(client):
    token, _ = _register(client, "gradeinvalid@test.com")

    response = _create_activity(client, token, grade_min=8, grade_max=3)

    assert response.status_code == 422


def test_grade_out_of_range_is_rejected(client):
    token, _ = _register(client, "gradeoutofrange@test.com")

    response = _create_activity(client, token, grade_min=0)

    assert response.status_code == 422


def test_group_size_max_below_min_is_rejected(client):
    token, _ = _register(client, "groupsizeinvalid@test.com")

    response = _create_activity(client, token, group_size_min=20, group_size_max=5)

    assert response.status_code == 422


def test_negative_duration_is_rejected(client):
    token, _ = _register(client, "negativeduration@test.com")

    response = _create_activity(client, token, duration_minutes=-5)

    assert response.status_code == 422


def test_negative_budget_is_rejected(client):
    token, _ = _register(client, "negativebudget@test.com")

    response = _create_activity(client, token, budget_estimate=-1)

    assert response.status_code == 422


def test_non_numeric_grade_is_rejected(client):
    token, _ = _register(client, "nonnumericgrade@test.com")

    response = _create_activity(client, token, grade_min="לא מספר")

    assert response.status_code == 422


def test_partial_update_cannot_conflict_with_stored_grade(client):
    token, _ = _register(client, "partialgradeupdate@test.com")
    activity = _create_activity(client, token, grade_min=5, grade_max=8).json()

    response = client.patch(
        f"/api/v1/activities/{activity['id']}",
        json={"grade_max": 2},
        headers=_auth_headers(token),
    )

    assert response.status_code == 422


def test_list_activities_is_paginated(client):
    token, _ = _register(client, "pageuser@test.com")
    for i in range(5):
        _create_activity(client, token, name=f"פעילות מספר {i}")

    response = client.get("/api/v1/activities?page=1&page_size=2", headers=_auth_headers(token))

    assert response.status_code == 200
    body = response.json()
    assert len(body["items"]) == 2
    assert body["page"] == 1
    assert body["page_size"] == 2
    assert body["total"] >= 5


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


def test_reply_to_a_specific_comment(client):
    creator_token, _ = _register(client, "replycreator@test.com", full_name="היוצר")
    activity = _create_activity(client, creator_token).json()
    asker_token, _ = _register(client, "replyasker@test.com", full_name="השואל")

    question = client.post(
        f"/api/v1/activities/{activity['id']}/comments",
        json={"body": "כמה זמן זה לוקח?"},
        headers=_auth_headers(asker_token),
    ).json()

    reply = client.post(
        f"/api/v1/activities/{activity['id']}/comments",
        json={"body": "כחצי שעה", "reply_to_id": question["id"]},
        headers=_auth_headers(creator_token),
    )

    assert reply.status_code == 201
    body = reply.json()
    assert body["reply_to_id"] == question["id"]
    assert body["reply_to_user_name"] == "השואל"

    listed = client.get(f"/api/v1/activities/{activity['id']}/comments", headers=_auth_headers(creator_token)).json()
    assert len(listed) == 2
    assert listed[0]["reply_to_id"] is None
    assert listed[1]["reply_to_id"] == question["id"]


def test_reply_to_comment_from_another_activity_is_rejected(client):
    creator_token, _ = _register(client, "replycrossactivity@test.com")
    activity_a = _create_activity(client, creator_token, name="פעילות א").json()
    activity_b = _create_activity(client, creator_token, name="פעילות ב").json()

    comment_on_a = client.post(
        f"/api/v1/activities/{activity_a['id']}/comments",
        json={"body": "שאלה על א"},
        headers=_auth_headers(creator_token),
    ).json()

    response = client.post(
        f"/api/v1/activities/{activity_b['id']}/comments",
        json={"body": "תגובה שגויה", "reply_to_id": comment_on_a["id"]},
        headers=_auth_headers(creator_token),
    )

    assert response.status_code == 404


def test_unread_comment_count_tracks_last_read(client):
    creator_token, _ = _register(client, "notifycreator@test.com")
    activity = _create_activity(client, creator_token).json()
    asker_token, _ = _register(client, "notifyasker@test.com")

    # No comments yet.
    unread = client.get("/api/v1/activities/comments/unread-count", headers=_auth_headers(creator_token)).json()
    assert unread["count"] == 0

    # Own comment on your own activity never counts as unread.
    client.post(
        f"/api/v1/activities/{activity['id']}/comments",
        json={"body": "הערה שלי על הפעילות שלי"},
        headers=_auth_headers(creator_token),
    )
    assert client.get(
        "/api/v1/activities/comments/unread-count", headers=_auth_headers(creator_token)
    ).json()["count"] == 0

    client.post(
        f"/api/v1/activities/{activity['id']}/comments",
        json={"body": "שאלה מהשואל"},
        headers=_auth_headers(asker_token),
    )
    unread = client.get("/api/v1/activities/comments/unread-count", headers=_auth_headers(creator_token)).json()
    assert unread["count"] == 1

    # The asker's own count stays 0 -- it's not their activity.
    asker_unread = client.get("/api/v1/activities/comments/unread-count", headers=_auth_headers(asker_token)).json()
    assert asker_unread["count"] == 0

    mark = client.post("/api/v1/activities/comments/mark-read", headers=_auth_headers(creator_token))
    assert mark.status_code == 204

    after_read = client.get(
        "/api/v1/activities/comments/unread-count", headers=_auth_headers(creator_token)
    ).json()
    assert after_read["count"] == 0


def test_list_unread_comments_notification(client):
    creator_token, _ = _register(client, "unreadlistcreator@test.com")
    activity = _create_activity(client, creator_token, name="הפעילות שלי").json()
    asker_token, asker_user = _register(client, "unreadlistasker@test.com", full_name="השואל")

    client.post(
        f"/api/v1/activities/{activity['id']}/comments",
        json={"body": "יש לי שאלה"},
        headers=_auth_headers(asker_token),
    )

    listed = client.get("/api/v1/activities/comments/unread", headers=_auth_headers(creator_token))
    assert listed.status_code == 200
    items = listed.json()
    assert len(items) == 1
    assert items[0]["activity_id"] == activity["id"]
    assert items[0]["activity_name"] == "הפעילות שלי"
    assert items[0]["user_name"] == "השואל"
    assert items[0]["body"] == "יש לי שאלה"

    client.post("/api/v1/activities/comments/mark-read", headers=_auth_headers(creator_token))
    after_read = client.get("/api/v1/activities/comments/unread", headers=_auth_headers(creator_token))
    assert after_read.json() == []


def test_created_by_me_filter(client):
    token, user = _register(client, "onlymine@test.com")
    other_token, _ = _register(client, "notmine@test.com")
    _create_activity(client, token, name="שלי")
    _create_activity(client, other_token, name="לא שלי")

    response = client.get(
        "/api/v1/activities?created_by_me=true", headers=_auth_headers(token)
    )

    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) == 1
    assert items[0]["creator_id"] == user["id"]


def test_hebrew_activity_fields_round_trip(client):
    token, _ = _register(client, "hebrewactivity@test.com")

    response = _create_activity(
        client,
        token,
        name="משחק חבל בשלג",
        description="פעילות חורף מהנה עם חבלים",
        location="field_trip",
        equipment=["חבלים", "כפפות"],
        tags=["חורף", "שלג"],
    )

    assert response.status_code == 201
    activity = response.json()
    assert activity["name"] == "משחק חבל בשלג"
    assert activity["location"] == "field_trip"
    assert activity["tags"] == ["חורף", "שלג"]
    assert activity["equipment"] == ["חבלים", "כפפות"]

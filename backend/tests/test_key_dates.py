# Tests for the shared institution-wide "year overview" landmark
# dates: any counselor in the institution can view them, only an
# institution admin can add/remove one.


def _register(client, email, password="pass1234", full_name="Test User"):
    response = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "full_name": full_name},
    )
    body = response.json()
    return body["access_token"], body["user"]


def _auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def _make_admin_with_institution(client, admin_email, institution_name="Test Institution"):
    admin_token, admin_user = _register(client, admin_email)
    client.post(
        "/api/v1/institutions", json={"name": institution_name}, headers=_auth_headers(admin_token)
    )
    return admin_token, admin_user


def test_admin_can_create_and_list_key_date(client):
    admin_token, _ = _make_admin_with_institution(client, "keydateadmin@test.com")

    response = client.post(
        "/api/v1/key-dates",
        json={"name": "חנוכה", "date": "2026-12-14", "note": "אין מפגש רגיל"},
        headers=_auth_headers(admin_token),
    )

    assert response.status_code == 201
    key_date = response.json()
    assert key_date["name"] == "חנוכה"
    assert key_date["date"] == "2026-12-14"

    listed = client.get("/api/v1/key-dates", headers=_auth_headers(admin_token))
    assert listed.status_code == 200
    assert len(listed.json()) == 1


def test_non_admin_cannot_create_key_date(client):
    admin_token, _ = _make_admin_with_institution(client, "keydatenonadmin@test.com")
    layer = client.post(
        "/api/v1/layers", json={"name": "Layer A"}, headers=_auth_headers(admin_token)
    ).json()
    counselor_token, _ = _register(client, "keydatecounselor@test.com")
    client.post(
        "/api/v1/layers/join", json={"join_code": layer["join_code"]}, headers=_auth_headers(counselor_token)
    )

    response = client.post(
        "/api/v1/key-dates",
        json={"name": "טיול שנתי", "date": "2026-05-01"},
        headers=_auth_headers(counselor_token),
    )

    assert response.status_code == 403


def test_user_with_no_institution_sees_empty_key_dates(client):
    token, _ = _register(client, "keydatenoinst@test.com")

    response = client.get("/api/v1/key-dates", headers=_auth_headers(token))

    assert response.status_code == 200
    assert response.json() == []


def test_admin_can_delete_key_date(client):
    admin_token, _ = _make_admin_with_institution(client, "keydatedelete@test.com")
    key_date = client.post(
        "/api/v1/key-dates",
        json={"name": "פסח", "date": "2027-04-01"},
        headers=_auth_headers(admin_token),
    ).json()

    response = client.delete(f"/api/v1/key-dates/{key_date['id']}", headers=_auth_headers(admin_token))
    assert response.status_code == 204

    listed = client.get("/api/v1/key-dates", headers=_auth_headers(admin_token)).json()
    assert listed == []


def test_blank_key_date_name_is_rejected(client):
    admin_token, _ = _make_admin_with_institution(client, "keydateblank@test.com")

    response = client.post(
        "/api/v1/key-dates",
        json={"name": "   ", "date": "2026-10-01"},
        headers=_auth_headers(admin_token),
    )

    assert response.status_code == 422

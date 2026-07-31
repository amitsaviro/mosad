# Tests for /auth/register, /auth/login, /auth/me.
# Each test uses the `client` fixture from conftest.py, which talks to
# a real (but temporary) Postgres database — not mocks — so these tests
# catch real bugs in our SQL/ORM code, not just our Python logic.


def _register(client, email="user@test.com", password="pass1234", full_name="Test User"):
    return client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "full_name": full_name},
    )


def test_register_returns_token_and_user(client):
    response = _register(client)

    assert response.status_code == 201
    body = response.json()
    assert body["access_token"]
    assert body["user"]["email"] == "user@test.com"
    assert body["user"]["full_name"] == "Test User"
    # Brand-new user has no institution/role yet.
    assert body["user"]["role"] is None
    assert body["user"]["institution_id"] is None


def test_register_duplicate_email_fails(client):
    _register(client)
    response = _register(client)

    assert response.status_code == 400


def test_login_with_correct_credentials_succeeds(client):
    _register(client, email="login@test.com", password="correct-password")

    response = client.post(
        "/api/v1/auth/login",
        json={"email": "login@test.com", "password": "correct-password"},
    )

    assert response.status_code == 200
    assert response.json()["user"]["email"] == "login@test.com"


def test_login_with_wrong_password_fails(client):
    _register(client, email="login2@test.com", password="correct-password")

    response = client.post(
        "/api/v1/auth/login",
        json={"email": "login2@test.com", "password": "wrong-password"},
    )

    assert response.status_code == 401


def test_login_with_unknown_email_fails(client):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@test.com", "password": "whatever"},
    )

    assert response.status_code == 401


def test_me_without_token_is_rejected(client):
    response = client.get("/api/v1/auth/me")

    assert response.status_code == 401


def test_me_with_valid_token_returns_current_user(client):
    token = _register(client, email="me@test.com").json()["access_token"]

    response = client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 200
    assert response.json()["email"] == "me@test.com"


def test_me_with_garbage_token_is_rejected(client):
    response = client.get(
        "/api/v1/auth/me", headers={"Authorization": "Bearer not-a-real-jwt"}
    )

    assert response.status_code == 401


def test_register_rejects_password_shorter_than_8_chars(client):
    response = _register(client, password="short")

    assert response.status_code == 422


def test_register_rejects_invalid_email_format(client):
    response = _register(client, email="not-an-email")

    assert response.status_code == 422

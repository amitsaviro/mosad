# Tests for the computed Israeli holiday list -- correctness is backed
# by the `hdate` Hebrew-calendar library, so these tests only check the
# API's plumbing (auth required, filters by range, no Rosh Chodesh,
# multi-day holidays collapse into a single range).


def _register(client, email, password="pass1234", full_name="Test User"):
    response = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "full_name": full_name},
    )
    return response.json()["access_token"]


def _auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_requires_auth(client):
    response = client.get("/api/v1/holidays")
    assert response.status_code == 401


def test_lists_holidays_in_default_range(client):
    token = _register(client, "holidaydefault@test.com")

    response = client.get("/api/v1/holidays", headers=_auth_headers(token))

    assert response.status_code == 200
    holidays = response.json()
    assert len(holidays) > 20
    names = {h["name"] for h in holidays}
    assert "ראש חודש" not in names


def test_lists_holidays_for_explicit_range(client):
    token = _register(client, "holidayrange@test.com")

    # Passover 5786 falls in early April 2026.
    response = client.get(
        "/api/v1/holidays",
        params={"from_date": "2026-04-01", "to_date": "2026-04-10"},
        headers=_auth_headers(token),
    )

    assert response.status_code == 200
    holidays = response.json()
    assert any("פסח" in h["name"] for h in holidays)
    for h in holidays:
        assert "2026-04-01" <= h["start_date"] <= "2026-04-10"


def test_multi_day_holiday_collapses_to_a_range(client):
    token = _register(client, "holidayrangecollapse@test.com")

    response = client.get(
        "/api/v1/holidays",
        params={"from_date": "2026-04-01", "to_date": "2026-04-10"},
        headers=_auth_headers(token),
    )

    holidays = response.json()
    chol_hamoed = [h for h in holidays if h["name"] == "חול המועד פסח"]
    assert len(chol_hamoed) == 1
    assert chol_hamoed[0]["start_date"] < chol_hamoed[0]["end_date"]

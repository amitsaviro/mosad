# Mosad

Management system for non-formal education frameworks (מוסדות, שכבות, מדריכים, חניכים).

## Stack

- Backend: FastAPI (Python) + SQLAlchemy 2.0 + Alembic
- Frontend: Expo (React Native + react-native-web) — one codebase for web, iOS, and Android
- Database: PostgreSQL (local via Docker Compose)

## Local dev setup

```bash
docker compose up -d db
```

### Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env   # edit if needed
alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

`--host 0.0.0.0` is required (not just `127.0.0.1`) if you want to test the
frontend on a physical phone over the same Wi-Fi network — otherwise the
server only accepts connections from the same machine.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
```

Edit `.env`: `EXPO_PUBLIC_API_BASE_URL` should point at `http://localhost:8000/api/v1`
for web/simulator, or at your computer's **LAN IP** (e.g.
`http://192.168.1.23:8000/api/v1`, found via `ipconfig getifaddr en0` on
macOS) when testing on a physical phone via Expo Go — `localhost` on the
phone means the phone itself, not your computer. Update it again if you
switch networks.

```bash
npx expo start
```

Scan the QR code with the Expo Go app (iOS/Android) to run it on a phone,
or press `w` to open it in a browser.

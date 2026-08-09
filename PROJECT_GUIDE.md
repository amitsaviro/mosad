# מדריך לפרויקט Mosad

מסמך התמצאות: איפה אנחנו עומדים, מה נשאר, ואיך בנוי כל קובץ בפרויקט. המטרה היא שתוכל לפתוח כל קובץ ולדעת מיד למה הוא קיים ולאן הוא מתחבר.

---

## 1. איפה אנחנו עומדים

**הושלם (שלבים 1-7):**

| שלב | מה נבנה |
|---|---|
| 1 | שלד הריפו, backend + frontend ריקים, git |
| 2 | חיבור ל-Postgres, מודלים ראשונים, migration ראשון |
| 3 | הרשמה/התחברות (JWT), מוסדות חינוך, שכבות עם קוד הצטרפות |
| 4 | שיוך מדריכים לשכבות, ניהול חניכים (CRUD) |
| 5 | שלד ה-frontend (Expo), מסכי התחברות/הרשמה/דשבורד |
| 6 | חיבור מלא frontend↔backend, אימות ידני מקצה לקצה |
| 7 | **מאגר פעילויות ארצי**: יצירה/עריכה/מחיקה, חיפוש וסינון (סוג, קטגוריה, מיקום, טווח שכבות, כמות משתתפים, תגית), דירוגים, תגובות, ציוד, טלפון ליצירת קשר |

**לא התחיל (שלבים 8-12):**

| שלב | מה כולל |
|---|---|
| 8 | לוח שנה/שיבוץ לשכבה, בלוקים מורכבים (פתיחה+מרכזית), רשימת ציוד עם סימון וי לפעילות מתוזמנת, זיהוי התנגשויות |
| 9 | נוכחות, הערות מתויגות על חניכים, תזכורות ימי הולדת |
| 10 | צ'אט קבוצתי + מרכז התראות |
| 11 | תיקי טיול |
| 12 | סוכן AI לתזמון (LangGraph/LangChain/AutoGen) |

כרגע **73-75 בדיקות backend עוברות** (`pytest`), וה-frontend עובר `tsc --noEmit` נקי. כל שינוי סכמה מלווה ב-migration של Alembic.

---

## 2. מבנה כללי של הריפו

```
mosad/
├── docker-compose.yml     # מרים רק Postgres מקומי (לא מריץ backend/frontend)
├── README.md              # הוראות הרצה + משתני סביבה
├── PROJECT_GUIDE.md        # הקובץ הזה
├── backend/                # FastAPI + SQLAlchemy + Alembic
└── frontend/                # Expo (React Native + react-native-web)
```

הבחירה: Postgres רץ ב-Docker כי הוא צריך "להישאר דלוק" ולשמור נתונים; ה-backend וה-frontend רצים ישירות (לא ב-Docker) כדי לקבל reload מהיר בזמן פיתוח.

---

## 3. Backend (`backend/`)

### 3.1 שלד כללי

```
backend/
├── alembic.ini            # קונפיג ל-Alembic (כלי ה-migrations)
├── alembic/versions/       # כל migration הוא קובץ נפרד כאן, לפי סדר כרונולוגי
├── pytest.ini
├── requirements.txt         # תלויות production
├── requirements-dev.txt      # + pytest וכו׳
├── .env                     # DATABASE_URL, JWT_SECRET (לא ב-git)
├── app/
│   ├── main.py             # נקודת הכניסה - FastAPI app
│   ├── config.py            # קריאת .env
│   ├── database.py          # חיבור ל-DB, session, Base
│   ├── core/                # אבטחה + הרשאות (deps)
│   ├── models/               # טבלאות (SQLAlchemy ORM)
│   ├── schemas/               # חוזה ה-API (Pydantic) - מה נכנס/יוצא ב-JSON
│   ├── services/               # הלוגיקה העסקית עצמה
│   └── routers/                 # ה-endpoints (רק "צינור" - קורא ל-services)
└── tests/                        # קובץ בדיקות אחד לכל routers-קבוצה
```

**זרימת בקשה טיפוסית:** `router` מקבל בקשת HTTP → מאמת הרשאה דרך `core/deps.py` → קורא לפונקציה ב-`service` המתאים → ה-service עובד עם `models` (ORM) → מחזיר `schema` (Pydantic) שהופך ל-JSON.

השכבות האלה מכוונות: **routers דקים** (רק wiring), **services** מכילים את כל ההיגיון, **models** הם רק ייצוג הטבלה, **schemas** הם רק צורת ה-JSON. זה אומר שאם רוצים לשנות כלל עסקי - הולכים ל-service, לא ל-router.

### 3.2 `app/core/` — אבטחה והרשאות

- **`security.py`** — פונקציות טהורות בלי גישה ל-DB: `hash_password`/`verify_password` (bcrypt), `create_access_token`/`decode_access_token` (JWT).
- **`deps.py`** — "תלויות" של FastAPI, כלומר פונקציות שכל endpoint מבקש כפרמטר:
  - `get_current_user` — קורא את ה-token מה-header, מוודא תוקף, טוען את המשתמש מה-DB (לא סומך על נתוני ה-token עצמו, כי המשתמש יכול היה להיחסם בינתיים).
  - `require_institution_admin` — חוסם endpoint רק למנהלי מוסד (403).
  - `get_viewable_layer` — הרשאת **קריאה** לשכבה: מנהל המוסד, כל מדריך באותו מוסד (גם אם לא משוייך), או מדריך משוייך. שכבה שאין הרשאה אליה מחזירה **404 ולא 403** (כדי לא לחשוף שהיא בכלל קיימת).
  - `get_manageable_layer` — הרשאת **כתיבה**: מנהל, או מדריך המשוייך ספציפית לשכבה הזו.
  - `get_accessible_participant` — כמו למעלה אבל לפי חניך (בודק את השכבה שלו).

זו הנקודה הכי קריטית לבידוד בין מוסדות (multi-tenancy) — כל endpoint שנוגע בשכבה/חניך עובר דרך אחת מהפונקציות האלה.

### 3.3 `app/models/` — הטבלאות

- **`base.py`** — שני "mixins" ששאר הטבלאות יורשות מהם: `UUIDPKMixin` (מפתח UUID אקראי במקום 1,2,3...) ו-`TimestampMixin` (`created_at`/`updated_at` אוטומטיים).
- **`institution.py`** — `Institution`: מסגרת החינוך (שם ייחודי ארצית). אין לה סיסמה משלה - המשתמשים מתחברים אישית.
- **`user.py`** — `User`: חשבון. `institution_id`/`role` הם `nullable` כי משתמש חדש עדיין לא שייך לשום דבר עד שהוא יוצר/מצטרף לקבוצה. `UserRole` = `institution_admin` או `counselor`.
- **`layer.py`** — `Layer`: שכבה/קבוצה בתוך מוסד, עם `join_code` ייחודי להצטרפות. `UniqueConstraint(institution_id, name)` - שם שכבה חייב להיות ייחודי רק בתוך אותו מוסד.
- **`counselor_layer_assignment.py`** — טבלת קישור many-to-many בין `User` ל-`Layer` (מדריך יכול להיות משוייך לכמה שכבות). **שים לב**: מנהל מוסד לא צריך שורה כאן כדי לראות את כל השכבות של המוסד שלו - זה נבדק לפי `role`, לא לפי הטבלה הזו.
- **`participant.py`** — `Participant` (חניך): שייך לשכבה אחת, עם `is_active` ל"מחיקה רכה" (כדי לא לאבד היסטוריית נוכחות/הערות עתידית).
- **`activity.py`** — הטבלה הכי גדולה, ליבת מאגר הפעילויות. כולל 3 enums:
  - `ActivityType` — תפקיד בפעילות (פתיחה/מרכזית/סיכום).
  - `ActivityCategory` — קטגוריית תוכן (משחק/סדנה/שיח ודיון/גיבוש/ספורט/אומנות/טיול/טקס/ערב בנים/ערב בנות) - אפשר כמה בו-זמנית.
  - `ActivityLocation` — מיקום מרשימה סגורה (בחוץ/חדר סגור/אולם ספורט/כיתה/חדר אוכל/שטח/אחר).
  - שדות נוספים: `grade_min`/`grade_max` (טווח שכבות א-יב), `equipment` (מערך טקסט), `tags` (מערך טקסט חופשי לחגים/עונות), `contact_phone`, `budget_estimate`.
  - הפעילות **לא** שייכת למוסד מסויים - כל משתמש רואה את כל הפעילויות של כולם, אבל רק היוצר יכול לערוך/למחוק.
- **`activity_attachment.py`** / **`activity_rating.py`** / **`activity_comment.py`** — טבלאות "בת" של Activity: קישורים חיצוניים, דירוגים (שורה אחת לכל *שימוש* בפעילות, לא לכל משתמש - כדי לתמוך ב"נעשה שימוש 4 פעמים, ממוצע 4.5"), ותגובות ציבוריות.
- **`__init__.py`** — מייבא ומייצא את כל המודלים במקום אחד כדי ש-Alembic יראה את כולם.

### 3.4 `app/schemas/` — חוזה ה-API

קובץ אחד לכל משאב (`user.py`, `layer.py`, `institution.py`, `participant.py`, `activity.py`, `auth.py`). כל אחד בדרך כלל מכיל:
- `XCreate` — מה שמותר לשלוח ב-POST.
- `XUpdate` — מה שמותר לשלוח ב-PATCH (הכל אופציונלי - "רק מה שסופק ישתנה").
- `XOut` — מה שחוזר ב-JSON, כולל שדות מחושבים לפי הצופה (`can_manage`, `is_assigned`, `average_rating`).

**חשוב:** האימותים (validation) גרים כאן, לא ב-service. לדוגמה ב-`activity.py`: `Field(ge=0)` (לא שלילי), `Field(ge=1, le=12)` (שכבה בטווח א-יב), ו-`@model_validator` שבודק ששכבה/כמות משתתפים מקסימלית ≥ מינימלית. כל שגיאה כתובה בעברית.

### 3.5 `app/services/` — הלוגיקה העסקית

- **`auth_service.py`** — הרשמה, התחברות, יצירת ה-JWT response.
- **`institution_service.py`** — יצירה/עדכון מוסד, תופס `IntegrityError` על שם כפול והופך אותו להודעה נעימה ("שם זה תפוס").
- **`group_service.py`** — יצירת שכבה בתוך מוסד קיים.
- **`layer_service.py`** — CRUD לשכבות, שיוך/הסרת מדריכים, הצטרפות בקוד, `user_can_view_layer`/`user_can_manage_layer` (בהם משתמש `core/deps.py`), `leave_layer` (חוסם מנהל מלעזוב שכבה - רק למחוק).
- **`participant_service.py`** — CRUD לחניכים.
- **`user_service.py`** — עדכון/מחיקת פרופיל עצמי, ניהול חברי צוות ע"י מנהל.
- **`activity_service.py`** — הגדול ביותר: `create_activity`, `list_activities` (כל הסינונים - טקסט חופשי, סוג, קטגוריות, מיקום, **טווח שכבות עם חפיפה** (לא נקודה בודדת - סעיף 3.6 מסביר), כמות משתתפים, תגית, pagination), `update_activity` (כולל בדיקת חפיפה גם אחרי עדכון חלקי), `delete_activity`, `add_rating`, `add_comment`, ו-`to_activity_out` שבונה את ה-JSON הסופי כולל שדות מחושבים.

### 3.6 `app/routers/` — ה-endpoints

כל קובץ מגדיר `APIRouter` אחד שמתחבר ב-`main.py`. כולם מתחת ל-prefix `/api/v1`.

| קובץ | endpoints עיקריים |
|---|---|
| `auth.py` | `POST /auth/register`, `POST /auth/login`, `GET /auth/me` |
| `institutions.py` | `POST /institutions`, `PATCH /institutions/{id}` |
| `layers.py` | CRUD שכבות, `POST /layers/{id}/join`, שיוך/הסרת מדריכים, רשימת חברי שכבה |
| `participants.py` | CRUD חניכים בתוך שכבה |
| `users.py` | `GET/PATCH/DELETE /users/me`, ניהול חברי צוות ע"י מנהל |
| `activities.py` | CRUD פעילויות, `GET /activities` (כל הסינונים), דירוגים, תגובות |

**דוגמה למנגנון הטווח בשכבות** (חלק אחרון שתוקן): `GET /activities?grade_min=9&grade_max=12` לא מחפש התאמה מדוייקת אלא **חפיפה** - כל פעילות שהטווח שלה (`grade_min`/`grade_max` המאוחסנים) נוגע בכלל בטווח המבוקש. צד אחד שלא סופק (רק min או רק max) נחשב "פתוח" (בלי הגבלה מהצד הזה).

### 3.7 `alembic/versions/`

כל קובץ הוא migration אחד - שינוי אחד בסכמה, בסדר כרונולוגי (`down_revision` מצביע על הקודם). מריצים `alembic upgrade head` כדי להביא את ה-DB למצב העדכני. **תמיד** אחרי שינוי במודל (`app/models/`) צריך ליצור migration חדש (`alembic revision --autogenerate -m "..."`), לבדוק אותו ידנית (במיוחד עם enum/nullable), ואז להריץ `upgrade head`.

### 3.8 `tests/`

קובץ אחד לכל קבוצת routers (`test_layers.py`, `test_participants.py`, `test_activities.py`...). כל בדיקה מרימה DB נפרד בשם `mosad_test` (לא נוגעת בנתוני הפיתוח שלך). תבנית חוזרת: `_register` יוצר משתמש, `_make_admin_with_layer` יוצר מוסד+שכבה, ואז קוראים ל-endpoint ובודקים תגובה.

---

## 4. Frontend (`frontend/`)

Expo (React Native + react-native-web) — קוד אחד שרץ גם כאפליקציית טלפון וגם כאתר (`localhost:8081`), כדי לא לכתוב שני פרונטאנדים נפרדים.

### 4.1 שלד כללי

```
frontend/
├── app.json                  # קונפיג Expo
├── package.json
├── src/
│   ├── app/                   # מסכים - כל קובץ כאן = מסך, לפי הנתיב שלו (Expo Router)
│   ├── api/                    # קליינט ל-backend, קובץ אחד לכל משאב
│   ├── auth/                    # AuthContext - מי מחובר, טוקן
│   ├── components/                # רכיבי UI משותפים (Button, Card, TextField...)
│   ├── constants/                   # theme.ts (צבעים/מרווחים), activity.ts (תוויות בעברית)
│   ├── hooks/                        # use-theme, use-color-scheme
│   └── types/                         # index.ts - כל טיפוסי הנתונים במקום אחד
```

### 4.2 `src/app/` — המסכים (Expo Router)

Expo Router עובד לפי **file-based routing**: שם הקובץ/תיקייה = כתובת המסך. `[id].tsx` = פרמטר דינמי בנתיב.

| קובץ | נתיב | מה יש בו |
|---|---|---|
| `_layout.tsx` | - | לא מסך - "עוטף" את כל האפליקציה: `Stack` ניווט + guard שמפנה למסך התחברות אם אין משתמש מחובר |
| `login.tsx` | `/login` | טופס התחברות |
| `register.tsx` | `/register` | טופס הרשמה |
| `index.tsx` | `/` (דשבורד) | מסך הבית: יצירת/הצטרפות לקבוצה, רשימת שכבות, ניהול צוות, קישור למאגר פעילויות |
| `profile.tsx` | `/profile` | עריכת פרופיל אישי, מחיקת חשבון |
| `layer/[id].tsx` | `/layer/:id` | פרטי שכבה: רשימת חניכים, מדריכים משוייכים |
| `activities/index.tsx` | `/activities` | מאגר פעילויות: חיפוש/סינון + רשת קוביות + pagination |
| `activities/new.tsx` | `/activities/new` וגם `/activities/new?id=X` | טופס יצירה **וגם** עריכה (אותו קומפוננטה, לפי אם `id` קיים ב-query) |
| `activities/[id].tsx` | `/activities/:id` | פרטי פעילות: תיאור, ציוד, קישורים, דירוג, תגובות |

**דגש חשוב על `activities/index.tsx`**: משתמש ב-`useFocusEffect` (לא `useEffect` רגיל) כדי לטעון מחדש בכל פעם שחוזרים למסך הזה - לא רק בטעינה ראשונה. זה תיקן באג שבו יצירת פעילות וחזרה למאגר לא הראתה אותה.

### 4.3 `src/api/` — קליינט ה-backend

- **`client.ts`** — הבסיס: פונקציית `request` עוטפת `fetch`, מוסיפה את ה-JWT token אוטומטית, והופכת שגיאות (גם 422 של Pydantic וגם שגיאת רשת) להודעת עברית ברורה דרך `extractErrorMessage`. קובץ הזה **בכוונה** לא מייבא כלום מ-React/React Native - כדי שאפשר יהיה להעביר אותו לפרויקט אחר בלי שינוי.
- שאר הקבצים (`activities.ts`, `layers.ts`, `users.ts`, `institutions.ts`, `participants.ts`, `auth.ts`) - כל אחד עוטף endpoint-ים ספציפיים סביב `api.get/post/patch/delete`.

### 4.4 `src/auth/AuthContext.tsx`

מחזיק את המשתמש המחובר + הטוקן, שומר ל-`AsyncStorage` (= `localStorage` בדפדפן) כדי ששחזור טוקן יעבוד אחרי סגירת האפליקציה/ריענון דף. `refreshUser()` נקרא אחרי פעולות ששינו תפקיד/מוסד (למשל יצירת קבוצה ראשונה).

### 4.5 `src/components/` — רכיבי UI משותפים

- **`button.tsx`** — כפתור אחיד לכל האפליקציה: `variant` (primary/secondary/danger/ghost), `size` (medium/small), אפקט hover בדפדפן.
- **`card.tsx`**, **`text-field.tsx`**, **`badge.tsx`**, **`icon-button.tsx`** — אבני בניין בסיסיות.
- **`confirm-button.tsx`** — כפתור מחיקה שדורש אישור נוסף ("בטוח? כן/ביטול") - כי `react-native-web` לא תומך ב-`Alert.alert` אמיתי.
- **`editable-text.tsx`** — טקסט עם עיפרון עריכה inline (שינוי שם שכבה/משתמש בלי לעבור למסך נפרד).
- **`themed-text.tsx`** / **`themed-view.tsx`** — עוטפים שמכניסים אוטומטית את צבעי light/dark mode.

### 4.6 `src/constants/`

- **`theme.ts`** — צבעים (light/dark), מרווחים, פינות עיגול.
- **`activity.ts`** — כל התוויות בעברית + הרשימות עצמן, למשל `ACTIVITY_CATEGORY_LABELS`, `GRADE_LABELS` (1→א, 2→ב...יב). כל מקום שמציג/מסנן לפי קטגוריה/מיקום/שכבה מייבא מהקובץ הזה - כדי שתוספת ערך חדשה תעודכן במקום אחד.

### 4.7 `src/types/index.ts`

מראה (mirror) של סכמות ה-Pydantic ב-backend, במקום אחד. אם שדה משתנה ב-backend (כמו שקרה עם `age_min`→`grade_min`) - כאן זה המקום הראשון שצריך לעדכן בפרונט.

---

## 5. איך מריצים הכל מקומית

```bash
# 1. להרים את ה-DB (פעם אחת, נשאר דלוק ברקע)
cd mosad && docker compose up -d db

# 2. Backend
cd backend
.venv/bin/alembic upgrade head          # מביא את ה-DB לסכמה העדכנית
.venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000

# 3. Frontend (טרמינל נפרד)
cd frontend
npm run web       # פותח את localhost:8081
```

בדיקות backend: `cd backend && .venv/bin/python -m pytest -q`
בדיקת טיפוסים בפרונט: `cd frontend && npx tsc --noEmit`

---

## 6. תבניות שכדאי להכיר (כשמוסיפים פיצ'ר חדש)

1. **שדה חדש בטבלה קיימת** → `models/X.py` → `alembic revision --autogenerate` → לבדוק את קובץ ה-migration ידנית → `alembic upgrade head` → `schemas/X.py` (Create/Update/Out) → `services/X_service.py` (איפה שהשדה נכתב/נקרא) → אם צריך סינון, גם `routers/X.py`.
2. **בפרונט**, בעקבות שינוי כזה: `types/index.ts` → `constants/` (אם יש תוויות עברית) → `api/X.ts` → מסכי `app/X/*.tsx`.
3. **הרשאות**: כל endpoint שנוגע בשכבה/חניך צריך לעבור דרך `get_viewable_layer`/`get_manageable_layer`/`get_accessible_participant` מ-`core/deps.py` - לא לבדוק הרשאה ידנית בכל router בנפרד.
4. **הודעות שגיאה**: תמיד בעברית, מוגדרות ב-`schemas` (ולידציה) או `services`/`routers` (`HTTPException(detail="...")`) - הפרונט (`client.ts`) כבר יודע להציג אותן כמו שהן.
5. **מסך שצריך לרענן כשחוזרים אליו** (כמו מאגר הפעילויות) → `useFocusEffect` ולא `useEffect` רגיל.

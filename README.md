# campus.flow

A campus placement workspace for students, placement officers, and companies.

## Frontend

```powershell
npm install
npm run dev
```

## Flask API

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python app.py
```

The API seeds a local `backend/placement.db` SQLite database on first run.

### API surface

- `POST /api/auth/register` and `POST /api/auth/login`
- `GET /api/jobs` and `POST /api/jobs`
- `GET /api/companies`
- `POST /api/applications`
- `GET /api/applications`
- `PATCH /api/applications/<id>` for review, interviews, and selection updates
- `GET /api/health`

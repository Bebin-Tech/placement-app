<<<<<<< HEAD
# campus.flow

A working campus placement application for students, recruiters, and placement officers. It uses a React + TypeScript frontend, Flask API, and persistent SQLite storage. Python 3.12+ and Node.js are required for local development.

## Run locally

```powershell
npm ci
python -m venv backend/.venv-flask
.\backend\.venv-flask\Scripts\python.exe -m pip install -r backend/requirements.txt
npm run dev
```

Open http://localhost:5173. The development command starts Vite and the API on port 5000. `/api` is proxied to the backend. For a built application:

```powershell
npm run build
npm start
```

Open http://127.0.0.1:5000. No default users, shared passwords, demo records, or fake success responses are created. The database is initialized automatically at `data/campus.db`.

## First placement cycle

1. Create the institution's officer account using the administrator command below.
2. Students and company recruiters register from the sign-in page. Company registrations are pending approval.
3. Sign in as an officer and approve recruiting companies under **Companies**. Officers can also add partners and publish jobs on their behalf.
4. Students complete education and CGPA and upload a PDF resume (up to 2 MB).
5. Approved recruiters publish openings with a description, skills, minimum CGPA, and deadline. Students search, save, and apply to eligible openings.
6. Recruiters see only their own company’s applicants. Officers see the institution's complete pipeline. Review applications, shortlist candidates, schedule interviews, and record selection or rejection.
7. Students see status changes live and may withdraw non-final applications. Application uniqueness is enforced by job ID and student ID, including withdrawn applications.

Application deadlines are inclusive UTC calendar dates. Interviews are stored in UTC and displayed in the user's local timezone. Skills are descriptive; CGPA, completed education, a resume, company approval, and an open deadline are enforced at application time. Student academic details are self-reported and should be verified by the institution.

## Officer provisioning and account recovery

In PowerShell, read a password without printing it to the terminal, then provision an officer:

```powershell
$env:ADMIN_PASSWORD = Read-Host 'Officer password (12+ characters)' -MaskInput
npm run admin -- officer@college.edu "Placement Officer"
Remove-Item Env:ADMIN_PASSWORD
```

Students and recruiters cannot self-register as officers. Provisioning does not overwrite existing accounts. Users can change their own passwords from **My profile**. For forgotten passwords, an administrator must verify the person's identity and run:

```powershell
$env:ADMIN_PASSWORD = Read-Host 'New password (12+ characters)' -MaskInput
.\backend\.venv-flask\Scripts\python.exe backend/manage.py reset-password person@college.edu
Remove-Item Env:ADMIN_PASSWORD
```

Resetting revokes every existing session. Deliver recovery credentials through the institution's approved channel. Email verification, automated email recovery, SSO, and email reminders are not integrated; notifications are live in-app updates.

## Security and realtime behavior

- Salted scrypt password hashes; opaque random sessions stored as hashes in SQLite.
- HttpOnly, SameSite cookies, 24-hour expiry, and Secure cookies in production.
- CSRF tokens and same-origin validation on mutations; parameterized database queries.
- Server-enforced roles, company ownership, private application lists, and protected resume downloads.
- A resume is downloadable only by its owner, an officer, or a recruiter whose company received an application from that student. PDFs are served as attachments, not embedded HTML. File type checking validates the PDF signature, not malware content.
- Valid application status transitions, duplicate prevention, input bounds, foreign keys, and an audit table for business mutations.
- Authentication rate limiting: 30 attempts per remote address per 15 minutes per process. Behind a reverse proxy, add per-client rate limiting at the proxy; the application intentionally does not trust arbitrary forwarded IP headers.
- Authenticated server-sent events notify connected clients of changes. The client refetches authorized records, reconnects automatically, refreshes on focus, and polls every 30 seconds as a fallback. Up to five live streams are allowed per session.

## Production deployment

This repository includes a production frontend build, an application server, and a non-root Docker image. Production deployment still requires your institution's domain, infrastructure, access policies, and operational validation. Do not equate passing local tests with a completed production rollout.

```sh
docker build -t campus-flow .
docker run -d --name campus-flow --restart unless-stopped \
  -p 127.0.0.1:5000:5000 \
  -e APP_ORIGIN=https://placements.example.edu \
  -v campus-flow-data:/app/data campus-flow
```

Provision the officer in the same container/database using `python backend/manage.py create-officer` with `ADMIN_PASSWORD` supplied securely. The image defaults to `FLASK_ENV=production`, so browser access must use HTTPS through a reverse proxy. Set `APP_ORIGIN` to the exact public origin, without a trailing slash. Environment files are examples only; load environment variables through your process manager or container runtime.

Reverse proxy requirements:

- Terminate HTTPS and forward the original Host header.
- Forward `/api` and static requests to the Flask/Waitress port.
- Disable buffering for `/api/events` and use a read timeout greater than 20 seconds.
- Apply request size limits (4 MB) and per-client authentication rate limits.
- Keep the backend private and run one application process with a durable, locally attached SQLite volume. This version does not implement a distributed event broker or multi-replica deployment.

`GET /api/health` checks database connectivity. Capture server stderr and monitor health, disk space, request errors, and backup success. SIGINT/SIGTERM gracefully close live streams and the server. Restrict database filesystem permissions: it contains student data and resumes. Establish institutional privacy, retention, and restore procedures before onboarding real users. Add a PDF scanning service if required by the institution's upload policy.

SQLite access uses Python's standard `sqlite3` module. Waitress serves Flask in production. This single-process SQLite model is suitable for modest campus workloads; benchmark the institution's expected traffic before launch.

## Backups and restoration

Create a consistent SQLite snapshot while the application is running:

```powershell
.\backend\.venv-flask\Scripts\python.exe backend/manage.py backup backups/campus-2026-09-10.db
```

The destination must not exist. Set `DATABASE_PATH` if using a non-default database. Store backups securely outside the application host. Restore by stopping the server, preserving the current database and its `-wal`/`-shm` companions elsewhere, placing the backup at `DATABASE_PATH`, and restarting. Test restoration regularly. Never copy only the live main `.db` file while WAL writes are in progress.

## Verification

```powershell
npm test
npm run build
npm audit --omit=dev
```

Flask API tests use isolated databases and cover the placement lifecycle, access control, CSRF, eligibility, duplicate submissions, password changes, and session logout. They do not modify application data.

Browser end-to-end checks are in `scripts/browser-test.mjs`. They start Flask with an isolated temporary database and exercise the built frontend with Chrome. Install Playwright in your tooling environment and set `PLAYWRIGHT_PATH` to its package path if it is outside this project. Optionally set `BROWSER_CHANNEL=msedge` and `PYTHON_PATH`. Run `node scripts/browser-test.mjs` after building. Screenshots are written to ignored `artifacts/`.

Docker and a public HTTPS deployment have not been exercised in the local test environment. Load testing, external security review, and institution-specific acceptance testing remain rollout tasks.

## Legacy data

The original prototype database at `backend/placement.db` is preserved and is not used by the application. It is not imported automatically because it contains a plaintext demo password and expired job dates. New Flask data is stored at `data/campus.db`.
=======
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
>>>>>>> e9d2c44647ce0c4bbbcc2be571c954d38f42043d

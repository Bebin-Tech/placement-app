from pathlib import Path
import sqlite3
from flask import Flask, jsonify, request
from flask_cors import CORS

BASE_DIR = Path(__file__).resolve().parent
DATABASE = BASE_DIR / "placement.db"
app = Flask(__name__)
CORS(app)


def get_db():
    connection = sqlite3.connect(DATABASE)
    connection.row_factory = sqlite3.Row
    return connection


def init_db():
    connection = get_db()
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('student', 'officer', 'company')),
            password TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS companies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            industry TEXT NOT NULL,
            location TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            min_cgpa REAL NOT NULL DEFAULT 0,
            required_skills TEXT NOT NULL DEFAULT '',
            deadline TEXT,
            FOREIGN KEY(company_id) REFERENCES companies(id)
        );
        CREATE TABLE IF NOT EXISTS applications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            student_id INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'Under review',
            interview_at TEXT,
            selection_status TEXT,
            UNIQUE(job_id, student_id),
            FOREIGN KEY(job_id) REFERENCES jobs(id),
            FOREIGN KEY(student_id) REFERENCES users(id)
        );
        """
    )
    if connection.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0:
        connection.execute("INSERT INTO users(name, email, role, password) VALUES (?, ?, ?, ?)", ("Aarav Kapoor", "aarav@campus.flow", "student", "demo"))
        connection.execute("INSERT INTO companies(name, industry, location) VALUES (?, ?, ?)", ("Northstar Labs", "Technology", "Bengaluru"))
        connection.execute("INSERT INTO companies(name, industry, location) VALUES (?, ?, ?)", ("Aster & Co.", "Consulting", "Mumbai"))
        connection.execute("INSERT INTO jobs(company_id, title, description, min_cgpa, required_skills, deadline) VALUES (?, ?, ?, ?, ?, ?)", (1, "Product Design Intern", "Work with the product design team.", 7.5, "Figma,UX Research", "2024-09-10"))
        connection.execute("INSERT INTO jobs(company_id, title, description, min_cgpa, required_skills, deadline) VALUES (?, ?, ?, ?, ?, ?)", (2, "Business Analyst", "Support strategic client engagements.", 7.0, "Excel,SQL", "2024-09-15"))
        connection.commit()
    connection.close()


def rows_as_dict(rows):
    return [dict(row) for row in rows]


@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "service": "campus.flow"})


@app.post("/api/auth/register")
def register():
    data = request.get_json() or {}
    required = {"name", "email", "password", "role"}
    if not required.issubset(data):
        return jsonify({"error": "name, email, password and role are required"}), 400
    connection = get_db()
    try:
        cursor = connection.execute("INSERT INTO users(name, email, role, password) VALUES (?, ?, ?, ?)", tuple(data[key] for key in ("name", "email", "role", "password")))
        connection.commit()
        return jsonify({"id": cursor.lastrowid, "name": data["name"], "role": data["role"]}), 201
    except sqlite3.IntegrityError:
        return jsonify({"error": "An account with this email already exists"}), 409
    finally:
        connection.close()


@app.post("/api/auth/login")
def login():
    data = request.get_json() or {}
    connection = get_db()
    user = connection.execute("SELECT id, name, email, role FROM users WHERE email = ? AND password = ?", (data.get("email"), data.get("password"))).fetchone()
    connection.close()
    if user is None:
        return jsonify({"error": "Invalid email or password"}), 401
    return jsonify(dict(user))


@app.get("/api/jobs")
def jobs():
    connection = get_db()
    jobs_list = connection.execute("SELECT jobs.*, companies.name AS company_name, companies.industry, companies.location FROM jobs JOIN companies ON companies.id = jobs.company_id ORDER BY jobs.id DESC").fetchall()
    connection.close()
    return jsonify(rows_as_dict(jobs_list))


@app.post("/api/jobs")
def create_job():
    data = request.get_json() or {}
    required = {"company_id", "title", "min_cgpa", "required_skills"}
    if not required.issubset(data):
        return jsonify({"error": "company_id, title, min_cgpa and required_skills are required"}), 400
    connection = get_db()
    cursor = connection.execute("INSERT INTO jobs(company_id, title, description, min_cgpa, required_skills, deadline) VALUES (?, ?, ?, ?, ?, ?)", (data["company_id"], data["title"], data.get("description", ""), data["min_cgpa"], data["required_skills"], data.get("deadline")))
    connection.commit()
    connection.close()
    return jsonify({"id": cursor.lastrowid}), 201


@app.get("/api/companies")
def companies():
    connection = get_db()
    companies_list = connection.execute("SELECT * FROM companies ORDER BY name").fetchall()
    connection.close()
    return jsonify(rows_as_dict(companies_list))


@app.post("/api/applications")
def apply_for_job():
    data = request.get_json() or {}
    if not {"job_id", "student_id"}.issubset(data):
        return jsonify({"error": "job_id and student_id are required"}), 400
    connection = get_db()
    try:
        cursor = connection.execute("INSERT INTO applications(job_id, student_id) VALUES (?, ?)", (data["job_id"], data["student_id"]))
        connection.commit()
        return jsonify({"id": cursor.lastrowid, "status": "Under review"}), 201
    except sqlite3.IntegrityError:
        return jsonify({"error": "You have already applied for this role"}), 409
    finally:
        connection.close()


@app.get("/api/applications")
def applications():
    connection = get_db()
    applications_list = connection.execute("SELECT applications.*, jobs.title, companies.name AS company_name, users.name AS student_name FROM applications JOIN jobs ON jobs.id = applications.job_id JOIN companies ON companies.id = jobs.company_id JOIN users ON users.id = applications.student_id ORDER BY applications.id DESC").fetchall()
    connection.close()
    return jsonify(rows_as_dict(applications_list))


@app.patch("/api/applications/<int:application_id>")
def update_application(application_id):
    data = request.get_json() or {}
    allowed = {"status", "interview_at", "selection_status"}
    updates = {key: value for key, value in data.items() if key in allowed}
    if not updates:
        return jsonify({"error": "Provide a status, interview_at or selection_status"}), 400
    connection = get_db()
    fields = ", ".join(f"{key} = ?" for key in updates)
    connection.execute(f"UPDATE applications SET {fields} WHERE id = ?", (*updates.values(), application_id))
    connection.commit()
    connection.close()
    return jsonify({"id": application_id, **updates})


with app.app_context():
    init_db()

if __name__ == "__main__":
    app.run(debug=True, port=5000)

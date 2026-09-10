import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${(await derive(password, salt, 64)).toString('hex')}`;
}
export async function verifyPassword(password, hash) {
  const [salt, key] = hash.split(':');
  return timingSafeEqual(Buffer.from(key, 'hex'), await derive(password, salt, 64));
}
export const digest = value => createHash('sha256').update(value).digest('hex');
export function openDatabase(path = process.env.DATABASE_PATH || resolve('data/campus.db')) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS companies(id INTEGER PRIMARY KEY, name TEXT NOT NULL, industry TEXT NOT NULL, location TEXT NOT NULL, approved INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('student','company','officer')), company_id INTEGER REFERENCES companies(id), cgpa REAL NOT NULL DEFAULT 0, skills TEXT NOT NULL DEFAULT '', education TEXT NOT NULL DEFAULT '', graduation_year TEXT NOT NULL DEFAULT '', resume_name TEXT, resume BLOB);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, csrf TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS jobs(id INTEGER PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies(id), title TEXT NOT NULL, description TEXT NOT NULL, min_cgpa REAL NOT NULL CHECK(min_cgpa BETWEEN 0 AND 10), required_skills TEXT NOT NULL, deadline TEXT NOT NULL, closed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
    CREATE TABLE IF NOT EXISTS applications(id INTEGER PRIMARY KEY, job_id INTEGER NOT NULL REFERENCES jobs(id), student_id INTEGER NOT NULL REFERENCES users(id), status TEXT NOT NULL DEFAULT 'Under review', interview_at TEXT, interview_location TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), UNIQUE(job_id,student_id));
    CREATE TABLE IF NOT EXISTS saved(user_id INTEGER REFERENCES users(id), job_id INTEGER REFERENCES jobs(id), PRIMARY KEY(user_id,job_id));
    CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, actor_id INTEGER REFERENCES users(id), action TEXT NOT NULL, entity_id INTEGER, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
    CREATE INDEX IF NOT EXISTS application_student ON applications(student_id);
    CREATE INDEX IF NOT EXISTS job_company ON jobs(company_id);
    CREATE INDEX IF NOT EXISTS session_expiry ON sessions(expires);
    PRAGMA user_version=1;`);
  return db;
}
export const publicUser = u => { const {password, resume, ...safe} = u; return safe; };

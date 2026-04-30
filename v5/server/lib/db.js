import fs from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { DatabaseSync } from 'node:sqlite'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const serverRoot = path.resolve(__dirname, '..')

export const dataDir = path.join(serverRoot, '..', 'data')
export const generatedDir = path.join(dataDir, 'generated')
export const dbPath = path.join(dataDir, 'app.db')

await fs.mkdir(generatedDir, { recursive: true })

const db = new DatabaseSync(dbPath)
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = OFF;

  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    user_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS session_provider_secrets (
    sid TEXT NOT NULL,
    provider_env_key TEXT NOT NULL,
    secret_value TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (sid, provider_env_key)
  );

  CREATE TABLE IF NOT EXISTS oauth_states (
    state TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    sid TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS generated_files (
    file_id TEXT PRIMARY KEY,
    sid TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    validation_json TEXT,
    diagram_report_json TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
    ON sessions (expires_at);

  CREATE INDEX IF NOT EXISTS idx_oauth_states_expires_at
    ON oauth_states (expires_at);

  CREATE INDEX IF NOT EXISTS idx_generated_files_sid
    ON generated_files (sid);

  CREATE INDEX IF NOT EXISTS idx_generated_files_expires_at
    ON generated_files (expires_at);
`)

const listExpiredSessionIdsStmt = db.prepare(`
  SELECT sid
  FROM sessions
  WHERE expires_at <= ?
`)

const listGeneratedFilesToDeleteStmt = db.prepare(`
  SELECT file_id, file_path
  FROM generated_files
  WHERE expires_at <= ?
     OR sid IN (SELECT sid FROM sessions WHERE expires_at <= ?)
`)

const deleteGeneratedFileStmt = db.prepare(`
  DELETE FROM generated_files
  WHERE file_id = ?
`)

const listGeneratedFilesBySidStmt = db.prepare(`
  SELECT file_id, sid, file_name, file_path, created_at, expires_at, validation_json, diagram_report_json
  FROM generated_files
  WHERE sid = ?
  ORDER BY created_at DESC
`)

const deleteSessionProviderSecretsStmt = db.prepare(`
  DELETE FROM session_provider_secrets
  WHERE sid = ?
`)

const deleteOauthStatesBySidStmt = db.prepare(`
  DELETE FROM oauth_states
  WHERE sid = ?
`)

const deleteGeneratedFilesBySidStmt = db.prepare(`
  DELETE FROM generated_files
  WHERE sid = ?
`)

const listGeneratedFilesForSessionStmt = db.prepare(`
  SELECT file_id, file_path
  FROM generated_files
  WHERE sid = ?
`)

const deleteSessionStmt = db.prepare(`
  DELETE FROM sessions
  WHERE sid = ?
`)

const deleteExpiredOauthStatesStmt = db.prepare(`
  DELETE FROM oauth_states
  WHERE expires_at <= ?
`)

export function getDb() {
  return db
}

export function listGeneratedFilesBySid(sid) {
  return listGeneratedFilesBySidStmt.all(sid)
}

export async function cleanupSessionData(sid) {
  if (!sid) return
  const generated = listGeneratedFilesForSessionStmt.all(sid)
  for (const row of generated) {
    if (row?.file_path && existsSync(row.file_path)) {
      await fs.rm(row.file_path, { force: true }).catch(() => {})
    }
  }
  deleteGeneratedFilesBySidStmt.run(sid)
  deleteSessionProviderSecretsStmt.run(sid)
  deleteOauthStatesBySidStmt.run(sid)
  deleteSessionStmt.run(sid)
}

export async function initializeDatabase() {
  await fs.mkdir(generatedDir, { recursive: true })
  return { dbPath, generatedDir }
}

export async function cleanupExpiredData(now = Date.now()) {
  const generated = listGeneratedFilesToDeleteStmt.all(now, now)
  for (const row of generated) {
    if (row?.file_path && existsSync(row.file_path)) {
      await fs.rm(row.file_path, { force: true }).catch(() => {})
    }
    deleteGeneratedFileStmt.run(row.file_id)
  }

  const expiredSessions = listExpiredSessionIdsStmt.all(now)
  for (const row of expiredSessions) {
    await cleanupSessionData(row.sid)
  }

  deleteExpiredOauthStatesStmt.run(now)
}

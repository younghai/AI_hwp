import crypto from 'crypto'
import { cleanupSessionData, getDb } from './db.js'

const SESSION_TTL_MS = 24 * 60 * 60 * 1000
export const SESSION_COOKIE_NAME = 'v2_session'
const db = getDb()

const insertSessionStmt = db.prepare(`
  INSERT INTO sessions (sid, user_json, created_at, expires_at)
  VALUES (?, ?, ?, ?)
`)

const getSessionStmt = db.prepare(`
  SELECT sid, user_json, created_at, expires_at
  FROM sessions
  WHERE sid = ?
`)

const deleteSessionStmt = db.prepare(`
  DELETE FROM sessions
  WHERE sid = ?
`)

const deleteSessionSecretsStmt = db.prepare(`
  DELETE FROM session_provider_secrets
  WHERE sid = ?
`)

const deleteOauthStatesStmt = db.prepare(`
  DELETE FROM oauth_states
  WHERE sid = ?
`)

const getProviderSecretStmt = db.prepare(`
  SELECT secret_value
  FROM session_provider_secrets
  WHERE sid = ? AND provider_env_key = ?
`)

const upsertProviderSecretStmt = db.prepare(`
  INSERT INTO session_provider_secrets (sid, provider_env_key, secret_value, created_at)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(sid, provider_env_key)
  DO UPDATE SET secret_value = excluded.secret_value
`)

const deleteProviderSecretStmt = db.prepare(`
  DELETE FROM session_provider_secrets
  WHERE sid = ? AND provider_env_key = ?
`)

function getSessionRecord(sid) {
  if (!sid) return null
  const row = getSessionStmt.get(sid)
  if (!row) return null
  if (Date.now() > Number(row.expires_at)) {
    destroySession(sid)
    return null
  }
  return {
    sid: row.sid,
    user: JSON.parse(row.user_json),
    createdAt: Number(row.created_at),
    expiresAt: Number(row.expires_at)
  }
}

export function createSession(user) {
  const sid = crypto.randomBytes(32).toString('hex')
  const now = Date.now()
  insertSessionStmt.run(
    sid,
    JSON.stringify(user || {}),
    now,
    now + SESSION_TTL_MS
  )
  return sid
}

export function getSession(sid) {
  return getSessionRecord(sid)?.user || null
}

export function getSessionData(sid) {
  return getSessionRecord(sid) || null
}

export function setSessionProviderSecret(sid, envKey, value) {
  const session = getSessionRecord(sid)
  if (!session || !envKey) return false
  if (value) {
    upsertProviderSecretStmt.run(sid, envKey, value, Date.now())
  } else {
    deleteProviderSecretStmt.run(sid, envKey)
  }
  return true
}

export function getSessionProviderSecret(sid, envKey) {
  const session = getSessionRecord(sid)
  if (!session || !envKey) return ''
  return getProviderSecretStmt.get(sid, envKey)?.secret_value || ''
}

export async function destroySession(sid) {
  if (!sid) return
  await cleanupSessionData(sid)
}

export function requireSession(req, res, next) {
  const sid = req.cookies?.[SESSION_COOKIE_NAME]
  const session = getSessionData(sid)
  if (!session) {
    return res.status(401).json({ ok: false, error: '로그인이 필요합니다.' })
  }
  req.sessionId = sid
  req.sessionUser = session.user
  req.sessionData = session
  return next()
}

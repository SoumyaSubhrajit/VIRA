import { getSchedulerDb } from '@/lib/scheduler/db';
import {
  decryptSensitiveText,
  encryptSensitiveText,
  isEncryptedEnvelope,
} from '@/lib/security/crypto';

const USER_ID = 'default-user';
const DEFAULT_ISSUER = 'https://mcp.fold.money';

export interface StoredFoldTokens {
  clientId: string;
  accessToken: string;
  refreshToken: string | null;
  tokenType: string;
  scope: string | null;
  issuer: string;
  expiresAt: number;
  updatedAt: string;
}

export interface PendingFoldAuth {
  state: string;
  clientId: string;
  codeVerifier: string;
  redirectUri: string;
  createdAt: string;
}

let initialized: Promise<void> | null = null;

async function ensureTables(): Promise<void> {
  if (initialized) return initialized;
  initialized = (async () => {
    const db = await getSchedulerDb();
    await db.exec(`
      CREATE TABLE IF NOT EXISTS fold_oauth_tokens (
        user_id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        access_token TEXT NOT NULL,
        refresh_token TEXT,
        token_type TEXT NOT NULL DEFAULT 'Bearer',
        scope TEXT,
        issuer TEXT NOT NULL DEFAULT 'https://mcp.fold.money',
        expires_at INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS fold_oauth_pending (
        state TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        code_verifier TEXT NOT NULL,
        redirect_uri TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS fold_response_cache (
        cache_key TEXT PRIMARY KEY,
        payload_json TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  })();
  return initialized;
}

export async function getStoredFoldTokens(): Promise<StoredFoldTokens | null> {
  await ensureTables();
  const db = await getSchedulerDb();
  const row = await db.prepare(`
    SELECT client_id AS clientId, access_token AS accessToken, refresh_token AS refreshToken,
           token_type AS tokenType, scope, issuer, expires_at AS expiresAt, updated_at AS updatedAt
    FROM fold_oauth_tokens
    WHERE user_id = ?
  `).get<StoredFoldTokens>(USER_ID);
  if (!row) return null;

  try {
    const wasPlainAccess = !isEncryptedEnvelope(row.accessToken);
    const wasPlainRefresh = Boolean(row.refreshToken && !isEncryptedEnvelope(row.refreshToken));

    const accessToken = decryptSensitiveText(row.accessToken);
    const refreshToken = row.refreshToken ? decryptSensitiveText(row.refreshToken) : null;

    // Auto-upgrade any legacy plaintext token row to AES-256-GCM ciphertext at rest
    if (wasPlainAccess || wasPlainRefresh) {
      await saveStoredFoldTokens({
        clientId: row.clientId,
        accessToken,
        refreshToken,
        tokenType: row.tokenType,
        scope: row.scope,
        issuer: row.issuer,
        expiresAt: row.expiresAt,
      });
    }

    return {
      ...row,
      accessToken,
      refreshToken,
    };
  } catch (err) {
    console.error('[foldAuthStore] Failed to decrypt stored Fold tokens:', err);
    return null;
  }
}

export async function saveStoredFoldTokens(input: {
  clientId: string;
  accessToken: string;
  refreshToken?: string | null;
  tokenType?: string;
  scope?: string | null;
  issuer?: string;
  expiresAt: number;
}): Promise<void> {
  await ensureTables();
  const db = await getSchedulerDb();
  const now = new Date().toISOString();
  const encryptedAccess = encryptSensitiveText(input.accessToken);
  const encryptedRefresh = input.refreshToken ? encryptSensitiveText(input.refreshToken) : null;

  await db.prepare(`
    INSERT INTO fold_oauth_tokens (
      user_id, client_id, access_token, refresh_token, token_type, scope, issuer, expires_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      client_id = excluded.client_id,
      access_token = excluded.access_token,
      refresh_token = COALESCE(excluded.refresh_token, fold_oauth_tokens.refresh_token),
      token_type = excluded.token_type,
      scope = COALESCE(excluded.scope, fold_oauth_tokens.scope),
      issuer = excluded.issuer,
      expires_at = excluded.expires_at,
      updated_at = excluded.updated_at
  `).run(
    USER_ID,
    input.clientId,
    encryptedAccess,
    encryptedRefresh,
    input.tokenType ?? 'Bearer',
    input.scope ?? null,
    input.issuer ?? DEFAULT_ISSUER,
    input.expiresAt,
    now,
  );
}

export async function clearStoredFoldTokens(): Promise<void> {
  await ensureTables();
  const db = await getSchedulerDb();
  await db.prepare('DELETE FROM fold_oauth_tokens WHERE user_id = ?').run(USER_ID);
}

export async function savePendingFoldAuth(input: {
  state: string;
  clientId: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<void> {
  await ensureTables();
  const db = await getSchedulerDb();
  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  await db.prepare('DELETE FROM fold_oauth_pending WHERE created_at < ?').run(cutoff);
  await db.prepare(`
    INSERT OR REPLACE INTO fold_oauth_pending (state, client_id, code_verifier, redirect_uri, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    input.state,
    input.clientId,
    encryptSensitiveText(input.codeVerifier),
    input.redirectUri,
    now,
  );
}

export async function consumePendingFoldAuth(state: string): Promise<PendingFoldAuth | null> {
  await ensureTables();
  const db = await getSchedulerDb();
  const row = await db.prepare(`
    SELECT state, client_id AS clientId, code_verifier AS codeVerifier, redirect_uri AS redirectUri, created_at AS createdAt
    FROM fold_oauth_pending
    WHERE state = ?
  `).get<PendingFoldAuth>(state);
  if (!row) return null;
  await db.prepare('DELETE FROM fold_oauth_pending WHERE state = ?').run(state);

  // Reject stale PKCE attempts older than 15 minutes
  if (Date.now() - new Date(row.createdAt).getTime() > 15 * 60 * 1000) {
    return null;
  }

  try {
    return {
      ...row,
      codeVerifier: decryptSensitiveText(row.codeVerifier),
    };
  } catch {
    return null;
  }
}

export async function getCachedFoldResponse<T>(cacheKey: string): Promise<{ data: T; isFresh: boolean } | null> {
  await ensureTables();
  const db = await getSchedulerDb();
  const row = await db.prepare(`
    SELECT payload_json AS payloadJson, expires_at AS expiresAt
    FROM fold_response_cache
    WHERE cache_key = ?
  `).get<{ payloadJson: string; expiresAt: number }>(cacheKey);
  if (!row) return null;
  try {
    const jsonString = decryptSensitiveText(row.payloadJson);
    return {
      data: JSON.parse(jsonString) as T,
      isFresh: Date.now() < row.expiresAt,
    };
  } catch {
    return null;
  }
}

export async function setCachedFoldResponse(cacheKey: string, data: unknown, ttlMs: number): Promise<void> {
  await ensureTables();
  const db = await getSchedulerDb();
  const now = Date.now();
  const encryptedPayload = encryptSensitiveText(JSON.stringify(data));
  await db.prepare(`
    INSERT INTO fold_response_cache (cache_key, payload_json, expires_at, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(cache_key) DO UPDATE SET
      payload_json = excluded.payload_json,
      expires_at = excluded.expires_at,
      updated_at = excluded.updated_at
  `).run(cacheKey, encryptedPayload, now + ttlMs, new Date(now).toISOString());
}

export async function clearFoldResponseCache(): Promise<void> {
  await ensureTables();
  const db = await getSchedulerDb();
  await db.prepare('DELETE FROM fold_response_cache').run();
}

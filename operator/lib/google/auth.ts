import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import type { Credentials } from 'google-auth-library';
import { getGoogleConnection, updateGoogleConnection } from './db';
import type { DecryptedGoogleConnection, GoogleConnectionStatus } from './types';

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
] as const;

export const EXPECTED_GOOGLE_EMAIL = process.env.GOOGLE_ACCOUNT_EMAIL?.trim().toLowerCase()
  || 'soumyasubhrajit@gmail.com';

export function googleRedirectUri(): string {
  return process.env.GOOGLE_REDIRECT_URI?.trim()
    || `${process.env.VERA_BASE_URL?.replace(/\/$/, '') || 'http://localhost:3100'}/api/google/callback`;
}

export function googleOAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function encryptionKey(): Buffer {
  const material = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY || process.env.SCHEDULER_SECRET;
  if (!material) {
    throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY or SCHEDULER_SECRET is required to protect Google tokens.');
  }
  return crypto.createHash('sha256').update(material).digest();
}

export function encryptGoogleTokens(tokens: Credentials): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(tokens), 'utf8'), cipher.final()]);
  return JSON.stringify({
    v: 1,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: ciphertext.toString('base64'),
  });
}

export function decryptGoogleTokens(payload: string): Credentials {
  const envelope = JSON.parse(payload) as { v: number; iv: string; tag: string; data: string };
  if (envelope.v !== 1) throw new Error('Unsupported Google token envelope.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(envelope.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.data, 'base64')),
    decipher.final(),
  ]).toString('utf8');
  return JSON.parse(plaintext) as Credentials;
}

export function createGoogleOAuthClient(): OAuth2Client {
  if (!googleOAuthConfigured()) {
    throw new Error('Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
  }
  return new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    googleRedirectUri()
  );
}

export function createGoogleAuthorizationUrl(state: string): string {
  const client = createGoogleOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: true,
    login_hint: EXPECTED_GOOGLE_EMAIL,
    scope: [...GOOGLE_SCOPES],
    state,
  });
}

export async function getGoogleConnectionStatus(): Promise<GoogleConnectionStatus> {
  const connection = await getGoogleConnection();
  return {
    configured: googleOAuthConfigured(),
    connected: Boolean(connection),
    expectedEmail: EXPECTED_GOOGLE_EMAIL,
    email: connection?.email ?? null,
    redirectUri: googleRedirectUri(),
    calendarSyncEnabled: connection?.calendarSyncEnabled ?? true,
    tasksSyncEnabled: connection?.tasksSyncEnabled ?? true,
    gmailSendEnabled: connection?.gmailSendEnabled ?? true,
    gmailReadAuthorized: connection?.scopes.includes('https://www.googleapis.com/auth/gmail.readonly') ?? false,
    taskListTitle: connection?.taskListTitle ?? null,
    connectedAt: connection?.connectedAt ?? null,
  };
}

export async function getAuthorizedGoogleClient(): Promise<{ client: OAuth2Client; connection: DecryptedGoogleConnection } | null> {
  const stored = await getGoogleConnection();
  if (!stored) return null;
  const tokens = decryptGoogleTokens(stored.encryptedTokens);
  const client = createGoogleOAuthClient();
  client.setCredentials(tokens);
  client.on('tokens', (freshTokens) => {
    const merged = { ...tokens, ...freshTokens, refresh_token: freshTokens.refresh_token ?? tokens.refresh_token };
    void updateGoogleConnection({ encryptedTokens: encryptGoogleTokens(merged) });
  });
  return { client, connection: { ...stored, tokens } };
}

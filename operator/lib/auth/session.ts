import { createHash, timingSafeEqual } from 'crypto';
import { SignJWT, jwtVerify } from 'jose';

export const SESSION_COOKIE = 'vira_session';
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

function sessionSecret(): Uint8Array | null {
  const value = process.env.VIRA_SESSION_SECRET;
  return value ? new TextEncoder().encode(value) : null;
}

export function isAuthenticationConfigured(): boolean {
  return Boolean(process.env.VIRA_APP_PASSWORD && process.env.VIRA_SESSION_SECRET);
}

export function passwordMatches(candidate: string): boolean {
  const expected = process.env.VIRA_APP_PASSWORD;
  if (!expected) return false;
  const candidateHash = createHash('sha256').update(candidate).digest();
  const expectedHash = createHash('sha256').update(expected).digest();
  return timingSafeEqual(candidateHash, expectedHash);
}

export async function createSessionToken(): Promise<string> {
  const secret = sessionSecret();
  if (!secret) throw new Error('VIRA_SESSION_SECRET is not configured.');
  return new SignJWT({ role: 'owner' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('default-user')
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secret);
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  const secret = sessionSecret();
  if (!secret || !token) return false;
  try {
    const result = await jwtVerify(token, secret, { algorithms: ['HS256'] });
    return result.payload.sub === 'default-user' && result.payload.role === 'owner';
  } catch {
    return false;
  }
}

import { NextRequest, NextResponse } from 'next/server';
import {
  createSessionToken,
  isAuthenticationConfigured,
  passwordMatches,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from '@/lib/auth/session';

export const runtime = 'nodejs';

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

const globalLimiter = globalThis as typeof globalThis & {
  __viraLoginFailures?: Map<string, { count: number; resetAt: number }>;
};

function getFailureStore(): Map<string, { count: number; resetAt: number }> {
  if (!globalLimiter.__viraLoginFailures) {
    globalLimiter.__viraLoginFailures = new Map();
  }
  return globalLimiter.__viraLoginFailures;
}

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown';
  return request.headers.get('x-real-ip') || 'local';
}

export async function POST(request: NextRequest) {
  if (!isAuthenticationConfigured()) {
    return NextResponse.json({ error: 'Login has not been configured on this deployment.' }, { status: 503 });
  }

  const ip = clientIp(request);
  const store = getFailureStore();
  const now = Date.now();
  const record = store.get(ip);

  if (record && now < record.resetAt && record.count >= MAX_ATTEMPTS) {
    const retryMins = Math.ceil((record.resetAt - now) / 60_000);
    return NextResponse.json(
      { error: `Too many failed login attempts. Try again in ${retryMins} minute(s).` },
      { status: 429 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { password?: unknown };
  if (!passwordMatches(String(body.password ?? ''))) {
    const nextCount = record && now < record.resetAt ? record.count + 1 : 1;
    store.set(ip, { count: nextCount, resetAt: now + WINDOW_MS });
    return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 });
  }

  store.delete(ip);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}

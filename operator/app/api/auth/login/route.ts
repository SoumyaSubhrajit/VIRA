import { NextRequest, NextResponse } from 'next/server';
import {
  createSessionToken,
  isAuthenticationConfigured,
  passwordMatches,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from '@/lib/auth/session';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  if (!isAuthenticationConfigured()) {
    return NextResponse.json({ error: 'Login has not been configured on this deployment.' }, { status: 503 });
  }
  const body = await request.json().catch(() => ({})) as { password?: unknown };
  if (!passwordMatches(String(body.password ?? ''))) {
    return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 });
  }
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

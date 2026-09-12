import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createGoogleAuthorizationUrl, googleOAuthConfigured, googleRedirectUri } from '@/lib/google/auth';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  if (!googleOAuthConfigured()) {
    return NextResponse.json({
      error: 'Google OAuth setup is required before connecting an account.',
      code: 'GOOGLE_OAUTH_NOT_CONFIGURED',
    }, { status: 503 });
  }

  // OAuth state is stored in a host-only cookie. If VIRA was opened through
  // 127.0.0.1 but Google's registered callback uses localhost (or vice versa),
  // begin the flow on the callback host so the state cookie survives.
  const callbackOrigin = new URL(googleRedirectUri()).origin;
  if (request.nextUrl.origin !== callbackOrigin) {
    return NextResponse.redirect(new URL('/api/google/connect', callbackOrigin));
  }

  const state = crypto.randomBytes(32).toString('hex');
  const response = NextResponse.redirect(createGoogleAuthorizationUrl(state));
  response.cookies.set('vira_google_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: new URL(googleRedirectUri()).protocol === 'https:',
    maxAge: 10 * 60,
    path: '/',
  });
  return response;
}

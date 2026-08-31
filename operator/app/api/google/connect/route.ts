import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { createGoogleAuthorizationUrl, googleOAuthConfigured, googleRedirectUri } from '@/lib/google/auth';

export const runtime = 'nodejs';

export async function GET() {
  if (!googleOAuthConfigured()) {
    return NextResponse.json({
      error: 'Google OAuth setup is required before connecting an account.',
      code: 'GOOGLE_OAUTH_NOT_CONFIGURED',
    }, { status: 503 });
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

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { savePendingFoldAuth } from '@/lib/finance/foldAuthStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FOLD_ISSUER = 'https://mcp.fold.money';
export const FOLD_STATE_COOKIE = 'vira_fold_oauth_state';

function base64Url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function trustedOrigin(request: NextRequest): string {
  const origin = request.nextUrl.origin;
  if (process.env.NODE_ENV !== 'production') return origin;
  const host = request.headers.get('host');
  if (host) return `https://${host}`;
  return origin;
}

export async function GET(request: NextRequest) {
  try {
    const origin = trustedOrigin(request);
    const redirectUri = `${origin}/api/finance/fold/callback`;

    const regRes = await fetch(`${FOLD_ISSUER}/oauth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(12_000),
      body: JSON.stringify({
        client_name: 'VIRA Personal OS',
        redirect_uris: [redirectUri],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        scope: 'mcp:read offline_access',
      }),
    });

    if (!regRes.ok) {
      return NextResponse.json(
        { error: `Fold client registration failed (${regRes.status}).` },
        { status: 502 },
      );
    }

    const clientData = (await regRes.json()) as { client_id: string };
    const clientId = clientData.client_id;

    const codeVerifier = base64Url(crypto.randomBytes(32));
    const codeChallenge = base64Url(crypto.createHash('sha256').update(codeVerifier).digest());
    const state = base64Url(crypto.randomBytes(24));

    await savePendingFoldAuth({
      state,
      clientId,
      codeVerifier,
      redirectUri,
    });

    const authUrl = new URL(`${FOLD_ISSUER}/oauth/authorize`);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', 'mcp:read offline_access');
    authUrl.searchParams.set('resource', FOLD_ISSUER);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('state', state);

    const stateDigest = crypto.createHash('sha256').update(state).digest('hex');
    const response = NextResponse.redirect(authUrl.toString());
    response.cookies.set(FOLD_STATE_COOKIE, stateDigest, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 900,
    });
    return response;
  } catch (error) {
    console.error('[api/finance/fold/auth GET]', error instanceof Error ? error.message : 'Auth start failed');
    return NextResponse.json({ error: 'Failed to start Fold login.' }, { status: 500 });
  }
}

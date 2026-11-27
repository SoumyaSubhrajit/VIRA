import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { savePendingFoldAuth } from '@/lib/finance/foldAuthStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FOLD_ISSUER = 'https://mcp.fold.money';

function base64Url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function GET(request: NextRequest) {
  try {
    const origin = request.nextUrl.origin;
    const redirectUri = `${origin}/api/finance/fold/callback`;

    // Register a dedicated OAuth client for this VIRA origin
    const regRes = await fetch(`${FOLD_ISSUER}/oauth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
      const text = await regRes.text();
      return NextResponse.json(
        { error: `Fold client registration failed (${regRes.status}): ${text}` },
        { status: 502 },
      );
    }

    const clientData = (await regRes.json()) as { client_id: string };
    const clientId = clientData.client_id;

    // Generate PKCE verifier + S256 challenge + state
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

    return NextResponse.redirect(authUrl.toString());
  } catch (error) {
    console.error('[api/finance/fold/auth GET]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to start Fold login' },
      { status: 500 },
    );
  }
}

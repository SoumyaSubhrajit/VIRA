import { NextRequest, NextResponse } from 'next/server';
import { consumePendingFoldAuth, saveStoredFoldTokens } from '@/lib/finance/foldAuthStore';
import { setFinanceImportState } from '@/lib/finance/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FOLD_ISSUER = 'https://mcp.fold.money';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  if (error) {
    return NextResponse.redirect(`${origin}/?fold_error=${encodeURIComponent(errorDescription || error)}`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${origin}/?fold_error=${encodeURIComponent('Missing authorization code or state.')}`);
  }

  const pending = await consumePendingFoldAuth(state);
  if (!pending) {
    return NextResponse.redirect(`${origin}/?fold_error=${encodeURIComponent('Login session expired. Please click Connect Fold again.')}`);
  }

  try {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: pending.redirectUri,
      client_id: pending.clientId,
      code_verifier: pending.codeVerifier,
      resource: FOLD_ISSUER,
    });

    const tokenRes = await fetch(`${FOLD_ISSUER}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      return NextResponse.redirect(`${origin}/?fold_error=${encodeURIComponent(`Token exchange failed (${tokenRes.status}): ${text}`)}`);
    }

    const tokenData = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      token_type?: string;
      expires_in?: number;
      scope?: string;
    };

    await saveStoredFoldTokens({
      clientId: pending.clientId,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token ?? null,
      tokenType: tokenData.token_type ?? 'Bearer',
      scope: tokenData.scope ?? 'mcp:read offline_access',
      issuer: FOLD_ISSUER,
      expiresAt: Date.now() + ((tokenData.expires_in ?? 900) * 1000),
    });

    await setFinanceImportState(null, 'fold');

    return NextResponse.redirect(`${origin}/?fold=connected`);
  } catch (err) {
    console.error('[api/finance/fold/callback GET]', err);
    const msg = err instanceof Error ? err.message : 'Unexpected Fold callback error';
    return NextResponse.redirect(`${origin}/?fold_error=${encodeURIComponent(msg)}`);
  }
}

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { consumePendingFoldAuth, saveStoredFoldTokens } from '@/lib/finance/foldAuthStore';
import { setFinanceImportState } from '@/lib/finance/db';
import { FOLD_STATE_COOKIE } from '../auth/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FOLD_ISSUER = 'https://mcp.fold.money';

function safeEqualHex(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const error = searchParams.get('error');
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  const clearAndRedirect = (dest: string) => {
    const res = NextResponse.redirect(dest);
    res.cookies.delete(FOLD_STATE_COOKIE);
    return res;
  };

  if (error) {
    return clearAndRedirect(`${origin}/?fold_error=${encodeURIComponent('Fold authorization was declined or cancelled.')}`);
  }

  if (!code || !state) {
    return clearAndRedirect(`${origin}/?fold_error=${encodeURIComponent('Missing authorization code or state.')}`);
  }

  // Verify CSRF cookie matches OAuth state
  const stateCookie = request.cookies.get(FOLD_STATE_COOKIE)?.value ?? '';
  const expectedDigest = crypto.createHash('sha256').update(state).digest('hex');
  if (!safeEqualHex(stateCookie, expectedDigest)) {
    return clearAndRedirect(`${origin}/?fold_error=${encodeURIComponent('Security validation failed. Please click Connect Fold again.')}`);
  }

  const pending = await consumePendingFoldAuth(state);
  if (!pending) {
    return clearAndRedirect(`${origin}/?fold_error=${encodeURIComponent('Login session expired. Please click Connect Fold again.')}`);
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
      signal: AbortSignal.timeout(15_000),
      body: body.toString(),
    });

    if (!tokenRes.ok) {
      return clearAndRedirect(`${origin}/?fold_error=${encodeURIComponent(`Fold token exchange failed (${tokenRes.status}). Please retry.`)}`);
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

    return clearAndRedirect(`${origin}/?fold=connected`);
  } catch (err) {
    console.error('[api/finance/fold/callback GET]', err instanceof Error ? err.message : 'Callback error');
    return clearAndRedirect(`${origin}/?fold_error=${encodeURIComponent('Fold connection failed. Please try again.')}`);
  }
}

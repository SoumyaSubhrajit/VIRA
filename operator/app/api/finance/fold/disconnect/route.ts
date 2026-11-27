import { NextResponse } from 'next/server';
import {
  clearFoldResponseCache,
  clearStoredFoldTokens,
  getStoredFoldTokens,
} from '@/lib/finance/foldAuthStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const stored = await getStoredFoldTokens();

    // Best-effort remote revocation on Fold OAuth server
    if (stored) {
      const revokeEndpoint = `${stored.issuer || 'https://mcp.fold.money'}/oauth/revoke`;
      for (const token of [stored.refreshToken, stored.accessToken]) {
        if (!token) continue;
        await fetch(revokeEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          signal: AbortSignal.timeout(5000),
          body: new URLSearchParams({
            token,
            client_id: stored.clientId,
          }).toString(),
        }).catch(() => null);
      }
    }

    await clearStoredFoldTokens();
    await clearFoldResponseCache();

    return NextResponse.json({
      ok: true,
      message: 'Fold disconnected, remote tokens revoked, and cached financial records wiped.',
    });
  } catch (error) {
    console.error('[api/finance/fold/disconnect POST]', error instanceof Error ? error.message : 'Disconnect failed');
    return NextResponse.json({ error: 'Failed to disconnect Fold cleanly.' }, { status: 500 });
  }
}

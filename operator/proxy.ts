import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticationConfigured, SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session';

const PUBLIC_PATHS = new Set([
  '/login',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/cron/tick',
  '/api/scheduler/dispatch',
  '/api/gym/dispatch',
  '/api/gym/reminders/test',
  '/api/finance/dispatch',
  '/api/finance/import',
  '/api/notion/sync',
  '/api/finance/device',
]);

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function hasValidSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin || !host) return true; // non-browser / server-to-server calls without Origin
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Enforce strict Same-Origin check on mutating API requests from browsers
  if (
    pathname.startsWith('/api/') &&
    MUTATING_METHODS.has(request.method) &&
    !request.headers.get('authorization') &&
    !hasValidSameOrigin(request)
  ) {
    return NextResponse.json({ error: 'Cross-origin request rejected.' }, { status: 403 });
  }

  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const authenticated =
    isAuthenticationConfigured() &&
    (await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value));
  if (authenticated || (!isAuthenticationConfigured() && process.env.NODE_ENV !== 'production')) {
    const res = NextResponse.next();
    if (pathname.startsWith('/api/finance')) {
      res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    }
    return res;
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }
  const login = new URL('/login', request.url);
  login.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)'],
};

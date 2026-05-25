import { NextRequest, NextResponse } from 'next/server';

/**
 * One-time magic URL for the site owner to install a bypass cookie that
 * exempts this browser from the per-IP daily search rate limit.
 *
 * Usage:
 *   1. Set OWNER_BYPASS_TOKEN in your environment to a long random string.
 *   2. From a browser you want exempted, visit:
 *        https://<site>/api/owner?token=<that-token>
 *   3. The server validates the token, sets `strix_owner` as an HttpOnly
 *      cookie for 1 year, and redirects you to /app.
 *   4. /api/search now skips checkRateLimit() for requests carrying that
 *      cookie. Repeat the URL on every browser/device you use.
 *
 * If OWNER_BYPASS_TOKEN is not set, the route always returns 404 so the
 * endpoint doesn't even hint at being live in default deployments.
 */
export async function GET(request: NextRequest) {
  const expected = process.env.OWNER_BYPASS_TOKEN;
  if (!expected) {
    return new NextResponse('Not found', { status: 404 });
  }

  const provided = request.nextUrl.searchParams.get('token');
  if (!provided || provided !== expected) {
    // Generic 403 — don't leak whether the env var is set
    return new NextResponse('Forbidden', { status: 403 });
  }

  const response = NextResponse.redirect(new URL('/app', request.url));
  response.cookies.set('strix_owner', expected, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });
  return response;
}

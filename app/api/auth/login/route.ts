import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do a comparison to prevent timing leaks on length
    timingSafeEqual(Buffer.from(a), Buffer.from(a));
    return false;
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    const expectedEmail    = process.env.AUTH_EMAIL    ?? '';
    const expectedPassword = process.env.AUTH_PASSWORD ?? '';
    const sessionToken     = process.env.AUTH_TOKEN    ?? '';

    if (!expectedEmail || !expectedPassword || !sessionToken) {
      console.error('[auth] AUTH_EMAIL, AUTH_PASSWORD, and AUTH_TOKEN must be set in env');
      return NextResponse.json({ error: 'Auth not configured.' }, { status: 500 });
    }

    const emailMatch    = safeEqual(email    ?? '', expectedEmail);
    const passwordMatch = safeEqual(password ?? '', expectedPassword);

    if (!emailMatch || !passwordMatch) {
      return NextResponse.json({ error: 'Invalid credentials.' }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set('strix-session', sessionToken, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path:     '/',
      maxAge:   60 * 60 * 24 * 30, // 30 days
    });
    return response;
  } catch (err) {
    console.error('[auth/login] error:', err);
    return NextResponse.json({ error: 'Server error.' }, { status: 500 });
  }
}

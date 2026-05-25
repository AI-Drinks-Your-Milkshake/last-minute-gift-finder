import { NextRequest, NextResponse } from 'next/server';
import { addSignup, isKvConfigured } from '@/lib/kv';

// Loose email check — we just want to keep obvious junk out of the list.
// Anything that passes here is good enough; the inbox of record is /app/signups.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email || typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
      return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 });
    }

    const normalized = email.trim().toLowerCase();

    if (isKvConfigured()) {
      await addSignup(normalized);
    } else {
      // Dev fallback when KV isn't wired up — keeps local dev unblocked.
      console.log(`[Strix Beta] (no KV) signup: ${normalized} at ${new Date().toISOString()}`);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[beta] error:', err);
    return NextResponse.json({ error: 'Server error.' }, { status: 500 });
  }
}

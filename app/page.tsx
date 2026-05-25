'use client';

import { useState } from 'react';

const C = {
  bg:        '#0d0d11',
  surface:   '#16161e',
  border:    '#22222e',
  accent:    '#e8724a',
  textPri:   '#f2f2f8',
  textSec:   '#8888a2',
  textMuted: '#44445a',
};

export default function BetaPage() {
  const [email,    setEmail]   = useState('');
  const [status,   setStatus]  = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus('loading');
    setErrorMsg('');
    try {
      const res = await fetch('/api/beta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (res.ok) {
        setStatus('success');
      } else {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.error ?? 'Something went wrong. Please try again.');
        setStatus('error');
      }
    } catch {
      setErrorMsg('Network error. Please check your connection.');
      setStatus('error');
    }
  }

  return (
    <div style={{
      minHeight: '100vh', backgroundColor: C.bg, color: C.textPri,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '40px 24px', fontFamily: 'inherit',
    }}>
      <div style={{ maxWidth: 480, width: '100%' }}>

        {/* Logo */}
        <div style={{ marginBottom: 48 }}>
          <p style={{ fontSize: 24, fontWeight: 600, color: C.textPri, letterSpacing: '-0.02em' }}>
            <span style={{ color: C.accent }}>✦</span> Strix
          </p>
        </div>

        {status === 'success' ? (
          /* ── Success state ── */
          <div>
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              background: 'rgba(232,114,74,0.12)', border: `1px solid rgba(232,114,74,0.3)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, marginBottom: 24,
            }}>
              ✓
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 500, color: C.textPri, lineHeight: 1.2, marginBottom: 16 }}>
              You&apos;re on the list.
            </h1>
            <p style={{ fontSize: 16, color: C.textSec, lineHeight: 1.7 }}>
              Beta is full for now — we&apos;ll reach out as soon as we can add more people.
            </p>
          </div>
        ) : (
          /* ── Sign-up form ── */
          <div>
            <p style={{ fontSize: 11, color: C.textMuted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 20 }}>
              Private beta
            </p>
            <h1 style={{ fontSize: 38, fontWeight: 500, color: C.textPri, lineHeight: 1.15, marginBottom: 16, letterSpacing: '-0.02em' }}>
              Welcome to Strix.
            </h1>
            <p style={{ fontSize: 16, color: C.textSec, lineHeight: 1.7, marginBottom: 40, maxWidth: 400 }}>
              AI gift ideas tailored to any person, any occasion — in under a minute.
              Enter your email to request early access.
            </p>

            <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 380 }}>
              <input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                style={{
                  background: C.surface, border: `1px solid ${C.border}`,
                  color: C.textPri, borderRadius: 12, padding: '14px 18px',
                  fontSize: 15, fontFamily: 'inherit', outline: 'none',
                  width: '100%',
                }}
              />
              {status === 'error' && (
                <p style={{ fontSize: 13, color: '#f6a8a8', margin: 0 }}>{errorMsg}</p>
              )}
              <button
                type="submit"
                disabled={status === 'loading' || !email.trim()}
                style={{
                  background:  status === 'loading' ? '#22222e' : C.accent,
                  color:       status === 'loading' ? C.textMuted : '#fff',
                  border: 'none', borderRadius: 12, padding: '14px 28px',
                  fontSize: 15, fontWeight: 600, cursor: status === 'loading' ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit', letterSpacing: '0.03em',
                  transition: 'background 0.2s',
                }}
              >
                {status === 'loading' ? 'Joining…' : 'JOIN BETA'}
              </button>
            </form>
          </div>
        )}

        {/* Tagline */}
        <p style={{
          fontSize: 11, color: C.textMuted, lineHeight: 1.6, fontStyle: 'italic',
          marginTop: 64,
        }}>
          Strix. n. Owl genus. Large eyes, binocular vision, sharp in the dark.
        </p>
      </div>
    </div>
  );
}

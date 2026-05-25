'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const C = {
  bg:        '#0d0d11',
  surface:   '#16161e',
  border:    '#22222e',
  accent:    '#e8724a',
  textPri:   '#f2f2f8',
  textSec:   '#8888a2',
  textMuted: '#44445a',
};

function LoginForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const next         = searchParams.get('next') ?? '/app';

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [status,   setStatus]   = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setStatus('loading');
    setErrorMsg('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        router.push(next);
      } else {
        setErrorMsg('Incorrect email or password.');
        setStatus('error');
      }
    } catch {
      setErrorMsg('Network error. Please try again.');
      setStatus('error');
    }
  }

  return (
    <div style={{
      minHeight: '100vh', backgroundColor: C.bg, color: C.textPri,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '40px 24px', fontFamily: 'inherit',
    }}>
      <div style={{ maxWidth: 400, width: '100%' }}>

        {/* Logo */}
        <div style={{ marginBottom: 48 }}>
          <p style={{ fontSize: 24, fontWeight: 600, color: C.textPri, letterSpacing: '-0.02em' }}>
            <span style={{ color: C.accent }}>✦</span> Strix
          </p>
        </div>

        <h1 style={{ fontSize: 28, fontWeight: 500, color: C.textPri, lineHeight: 1.2, marginBottom: 8 }}>
          Sign in
        </h1>
        <p style={{ fontSize: 15, color: C.textSec, marginBottom: 36, lineHeight: 1.5 }}>
          Enter your credentials to access Strix.
        </p>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
            style={{
              background: C.surface, border: `1px solid ${status === 'error' ? 'rgba(232,75,75,0.4)' : C.border}`,
              color: C.textPri, borderRadius: 12, padding: '14px 18px',
              fontSize: 15, fontFamily: 'inherit', outline: 'none', width: '100%',
            }}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            style={{
              background: C.surface, border: `1px solid ${status === 'error' ? 'rgba(232,75,75,0.4)' : C.border}`,
              color: C.textPri, borderRadius: 12, padding: '14px 18px',
              fontSize: 15, fontFamily: 'inherit', outline: 'none', width: '100%',
            }}
          />
          {status === 'error' && (
            <p style={{ fontSize: 13, color: '#f6a8a8', margin: 0 }}>{errorMsg}</p>
          )}
          <button
            type="submit"
            disabled={status === 'loading'}
            style={{
              background:  status === 'loading' ? '#22222e' : C.accent,
              color:       status === 'loading' ? C.textMuted : '#fff',
              border: 'none', borderRadius: 12, padding: '14px 28px',
              fontSize: 15, fontWeight: 600,
              cursor: status === 'loading' ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', marginTop: 4,
            }}
          >
            {status === 'loading' ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p style={{
          fontSize: 11, color: C.textMuted, lineHeight: 1.6, fontStyle: 'italic', marginTop: 64,
        }}>
          Strix. n. Owl genus. Large eyes, binocular vision, sharp in the dark.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

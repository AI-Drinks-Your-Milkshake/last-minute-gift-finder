import { getSignups, isKvConfigured } from '@/lib/kv';
import type { BetaSignup } from '@/types';

// Always pull fresh from KV — this page is for the operator, not cacheable.
export const dynamic     = 'force-dynamic';
export const revalidate  = 0;

const C = {
  bg:        '#0d0d11',
  surface:   '#16161e',
  border:    '#22222e',
  accent:    '#e8724a',
  textPri:   '#f2f2f8',
  textSec:   '#8888a2',
  textMuted: '#44445a',
};

function formatTs(ts: number): string {
  const d = new Date(ts);
  // e.g. "May 25, 2026 · 9:42 PM"
  return d.toLocaleString(undefined, {
    year:   'numeric',
    month:  'short',
    day:    'numeric',
    hour:   'numeric',
    minute: '2-digit',
  });
}

export default async function SignupsPage() {
  const kvOn   = isKvConfigured();
  const list   = kvOn ? await getSignups() : [];
  // Newest first.
  const rows: BetaSignup[] = [...list].reverse();

  return (
    <div style={{
      minHeight: '100vh', backgroundColor: C.bg, color: C.textPri,
      padding: '64px 24px', fontFamily: 'inherit',
    }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 40 }}>
          <p style={{ fontSize: 11, color: C.textMuted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
            <span style={{ color: C.accent }}>✦</span> LastMinuteGiftFinder · Admin
          </p>
          <h1 style={{ fontSize: 28, fontWeight: 500, color: C.textPri, lineHeight: 1.2, margin: 0 }}>
            Beta signups
          </h1>
          <p style={{ fontSize: 14, color: C.textSec, marginTop: 8 }}>
            {kvOn
              ? `${rows.length} ${rows.length === 1 ? 'person' : 'people'} on the list.`
              : 'KV is not configured for this environment — no signups to show.'}
          </p>
        </div>

        {/* List */}
        {rows.length === 0 ? (
          <div style={{
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 12, padding: '24px 20px',
            color: C.textSec, fontSize: 14,
          }}>
            {kvOn
              ? 'No signups yet. The first one will show up here.'
              : 'Set KV_REST_API_URL and KV_REST_API_TOKEN to enable storage.'}
          </div>
        ) : (
          <div style={{
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 12, overflow: 'hidden',
          }}>
            {rows.map((s, i) => (
              <div
                key={`${s.ts}-${s.email}-${i}`}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  gap: 16, padding: '14px 18px',
                  borderTop: i === 0 ? 'none' : `1px solid ${C.border}`,
                }}
              >
                <span style={{
                  fontSize: 14, color: C.textPri,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  overflowWrap: 'anywhere',
                }}>
                  {s.email}
                </span>
                <span style={{ fontSize: 12, color: C.textMuted, whiteSpace: 'nowrap' }}>
                  {formatTs(s.ts)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Copy-all helper — server-rendered <details> so no JS needed */}
        {rows.length > 0 && (
          <details style={{ marginTop: 24, color: C.textSec, fontSize: 13 }}>
            <summary style={{ cursor: 'pointer', userSelect: 'none' }}>
              Copy all addresses
            </summary>
            <textarea
              readOnly
              value={rows.map(r => r.email).join('\n')}
              rows={Math.min(12, Math.max(3, rows.length))}
              style={{
                marginTop: 12, width: '100%',
                background: C.bg, border: `1px solid ${C.border}`,
                borderRadius: 8, padding: 12, color: C.textPri,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: 13, resize: 'vertical',
              }}
            />
          </details>
        )}
      </div>
    </div>
  );
}

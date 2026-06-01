'use client';

import { useState, useEffect, useRef } from 'react';

declare global {
  interface Window { __devLog?: (msg: string) => void; }
}

// Module-level store — survives component remounts (loading → results transition).
const _lines: string[] = [];
const _listeners = new Set<() => void>();

function appendLine(msg: string) {
  _lines.push(msg);
  _listeners.forEach((fn) => fn());
}

export function clearDevLog() {
  _lines.length = 0;
  _listeners.forEach((fn) => fn());
}

function lineColor(line: string): string {
  if (line.includes('[KV hit]'))    return '#4ade80';
  if (line.includes('[KV miss]'))   return '#facc15';
  if (line.includes('[KV error]'))  return '#f87171';
  if (line.includes('[Brave]'))     return '#60a5fa';
  if (line.includes('corner PASS')) return '#4ade80';
  if (line.includes('corner FAIL')) return '#f87171';
  if (line.includes('HEAD fail') || line.includes('download fail')) return '#f87171';
  if (line.includes('[result]') && line.includes('→ null')) return '#f87171';
  if (line.includes('[result]'))    return '#a3e635';
  if (line.includes('[search]') || line.includes('[SSE]')) return '#c084fc';
  if (line.includes('[images]'))    return '#fb923c';
  if (line.includes('[refresh]'))   return '#fb923c';
  if (line.startsWith('  ') || line.startsWith('    ')) return '#4b5563';
  return '#9ca3af';
}

export default function DevPanel() {
  // Shadow module-level lines into React state so renders are triggered.
  const [count, setCount] = useState(_lines.length);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Register global hook and subscribe to updates.
  useEffect(() => {
    window.__devLog = appendLine;
    const notify = () => setCount(_lines.length);
    _listeners.add(notify);
    return () => {
      _listeners.delete(notify);
      // Only delete the global if we're the last listener.
      if (_listeners.size === 0) delete window.__devLog;
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [count]);

  return (
    <div style={{
      marginTop: 16,
      fontFamily: 'ui-monospace, "Cascadia Code", "Fira Code", monospace',
      fontSize: 11, lineHeight: 1.65,
      maxHeight: 300, overflowY: 'auto',
      borderTop: '1px solid #1f2937',
      paddingTop: 10,
    }}>
      {_lines.length === 0 ? (
        <span style={{ color: '#374151' }}>awaiting output…</span>
      ) : (
        _lines.map((line, i) => (
          <div key={i} style={{ color: lineColor(line), whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {line}
          </div>
        ))
      )}
      <div ref={bottomRef} />
    </div>
  );
}

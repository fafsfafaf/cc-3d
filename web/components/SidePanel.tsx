'use client';
import { useEffect, useRef } from 'react';
import type { Session, LogEntry } from '@/lib/useSessions';

type Props = {
  session: Session | null;
  logs: LogEntry[];
  onClose: () => void;
};

export default function SidePanel({ session, logs, onClose }: Props) {
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs.length]);

  return (
    <div className={`sidepanel ${session ? '' : 'hidden'}`}>
      {session && (
        <>
          <header>
            <div>
              <div className="title">{session.projectName}</div>
              <div className="sub">{session.sessionId}</div>
            </div>
            <button className="close" onClick={onClose} aria-label="Close panel">×</button>
          </header>
          <div className="session-meta">
            <div><div className="k">Status</div><div className="v">{session.status}</div></div>
            <div><div className="k">Model</div><div className="v">{shortModel(session.model)}</div></div>
            <div><div className="k">Branch</div><div className="v">{session.gitBranch || '—'}</div></div>
            <div><div className="k">Events</div><div className="v">{session.eventCount}</div></div>
            <div><div className="k">Tokens</div><div className="v">{formatTokens(session.tokens)}</div></div>
            <div><div className="k">Subagents</div><div className="v">{session.subagents?.length || 0}</div></div>
          </div>
          {session.subagents?.length > 0 && (
            <div className="session-meta" style={{ borderBottom: '1px solid rgba(120, 160, 220, 0.15)' }}>
              {session.subagents.map((a, i) => (
                <div key={i} style={{ gridColumn: 'span 2' }}>
                  <div className="k" style={{ color: '#c08bff' }}>↳ {a.agentType} ({a.status})</div>
                  <div className="v" style={{ fontSize: 11 }}>{a.description || '—'}</div>
                </div>
              ))}
            </div>
          )}
          <div className="log" ref={logRef}>
            {logs.length === 0 && (
              <div style={{ color: '#4a5a72', padding: 14, fontFamily: 'inherit' }}>Waiting for live events…</div>
            )}
            {logs.map((l) => (
              <div key={l.id} className={`row ${l.eventType} ${l.isSubagent ? 'subagent' : ''}`}>
                <span className="ts">{formatTime(l.timestamp)}</span>
                <span className="type">{l.isSubagent ? '↳' : ''}{l.eventType}</span>
                <span className="body">{summarize(l.summary)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function summarize(s: LogEntry['summary']) {
  if (!s) return '';
  if (s.kind === 'tool_use') return `→ ${s.name}: ${s.description || ''}`;
  if (s.kind === 'tool_result') return `← ${s.text || ''}`;
  return s.text || '';
}
function formatTime(ts: string) {
  if (!ts) return '--:--:--';
  try { return new Date(ts).toLocaleTimeString(); } catch { return ts.slice(11, 19); }
}
function shortModel(m?: string) {
  if (!m) return '?';
  return m.replace('claude-', '').replace(/-2025\d+/, '').replace(/-\d{8}$/, '');
}
function formatTokens(t?: { input: number; output: number; cacheRead: number; cacheCreation: number }) {
  if (!t) return '0';
  const fmt = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
  return `${fmt(t.input + t.output)} (cache ${fmt(t.cacheRead + t.cacheCreation)})`;
}

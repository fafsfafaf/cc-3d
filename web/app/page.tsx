'use client';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSessions, type LogEntry } from '@/lib/useSessions';
import { useNotifications } from '@/lib/useNotifications';
import SidePanel from '@/components/SidePanel';

const Scene = dynamic(() => import('@/components/Scene'), { ssr: false });

export default function Page() {
  const { sessions, connected, logs, onEvent } = useSessions();
  const { enabled: notifyEnabled, toggle: toggleNotify, permission } = useNotifications();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pulses, setPulses] = useState<Record<string, number>>({});
  const [freeCam, setFreeCam] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const lastStatusRef = useRef<Record<string, string>>({});

  const visibleSessions = useMemo(
    () => sessions.filter((s) => s.status === 'active' || s.status === 'idle'),
    [sessions],
  );

  const selectedSession = useMemo(
    () => visibleSessions.find((s) => s.sessionId === selectedId) || null,
    [visibleSessions, selectedId],
  );

  const selectedLogs = useMemo(() => (selectedId ? logs[selectedId] || [] : []), [logs, selectedId]);

  const counts = useMemo(() => {
    const c = { active: 0, idle: 0 };
    for (const s of visibleSessions) {
      if (s.status === 'active') c.active++;
      else if (s.status === 'idle') c.idle++;
    }
    return c;
  }, [visibleSessions]);

  useEffect(() => {
    onEvent((e: LogEntry) => {
      const targetId = e.parentSessionId || e.sessionId;
      setPulses((prev) => ({
        ...prev,
        [targetId]: (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000,
      }));
    });
  }, [onEvent]);

  useEffect(() => {
    if (!notifyEnabled) return;
    for (const s of sessions) {
      const prev = lastStatusRef.current[s.sessionId];
      if (prev === 'active' && s.status !== 'active' && s.lastEventAt) {
        const tool = s.lastToolCall?.name || s.lastEventType || '?';
        const title = `${s.projectName}: ${s.status}`;
        if ('Notification' in window && Notification.permission === 'granted') {
          try {
            const n = new Notification(title, {
              body: `last: ${tool}`,
              silent: true,
              tag: `cc-3d-${s.sessionId}`,
            });
            n.onclick = () => {
              window.focus();
              setSelectedId(s.sessionId);
              n.close();
            };
          } catch { /* ignore */ }
        }
      }
      lastStatusRef.current[s.sessionId] = s.status;
    }
  }, [sessions, notifyEnabled]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'f' || e.key === 'F') setFreeCam((v) => !v);
      if (e.key === '?' || e.key === 'h') setShowHelp((v) => !v);
      if (e.key === 'Escape') {
        if (selectedId) setSelectedId(null);
        else if (freeCam) setFreeCam(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, freeCam]);

  return (
    <main style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <Scene
        sessions={visibleSessions}
        selectedId={selectedId}
        onSelect={setSelectedId}
        pulses={pulses}
        freeCam={freeCam}
      />
      <div className="hud">
        <div className="toolbar">
          <h1>cc<span>·</span>3d <span style={{ marginLeft: 12, color: '#4a5a72', fontSize: 11 }}>live agent workspace</span></h1>
          <div className="meta">
            <span className="pill active">● {counts.active} active</span>
            <span className="pill idle">◐ {counts.idle} idle</span>
            <button
              className={`notif-btn ${freeCam ? 'on' : ''}`}
              onClick={() => setFreeCam((v) => !v)}
              title="Toggle free camera mode (F)"
            >
              <span className="dot" />
              {freeCam ? 'Free Cam ON' : 'Free Cam'}
            </button>
            <button
              className={`notif-btn ${notifyEnabled ? 'on' : ''}`}
              onClick={toggleNotify}
              title={permission === 'denied' ? 'Permission denied — change in browser settings' : 'Toggle desktop notifications'}
            >
              <span className="dot" />
              {notifyEnabled ? 'Notifications ON' : permission === 'denied' ? 'Notifications BLOCKED' : 'Enable Notifications'}
            </button>
            <button
              className="notif-btn"
              onClick={() => setShowHelp((v) => !v)}
              title="Show controls (H)"
            >
              ?
            </button>
          </div>
        </div>

        <div className={`connection ${connected ? 'connected' : 'disconnected'}`}>
          {connected ? 'WebSocket connected · localhost:3435' : 'Reconnecting…'}
        </div>

        {visibleSessions.length === 0 && (
          <div className="empty-state">No active or idle sessions — start a Claude Code session</div>
        )}

        {showHelp && (
          <div className="help-overlay" onClick={() => setShowHelp(false)}>
            <div className="help-card" onClick={(e) => e.stopPropagation()}>
              <h2>Controls</h2>
              <div className="help-section">
                <h3>Orbit Camera (default)</h3>
                <ul>
                  <li><kbd>Drag</kbd> — rotate around scene</li>
                  <li><kbd>Right-Drag</kbd> — pan</li>
                  <li><kbd>Scroll</kbd> — zoom</li>
                </ul>
              </div>
              <div className="help-section">
                <h3>Free Camera (press F to toggle)</h3>
                <ul>
                  <li><kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> — walk</li>
                  <li><kbd>Drag</kbd> — look around</li>
                  <li><kbd>Space</kbd> / <kbd>E</kbd> — up</li>
                  <li><kbd>Q</kbd> / <kbd>Ctrl</kbd> — down</li>
                  <li><kbd>Shift</kbd> — sprint</li>
                </ul>
              </div>
              <div className="help-section">
                <h3>Interaction</h3>
                <ul>
                  <li>Click any character — open live event log</li>
                  <li><kbd>ESC</kbd> — close panel / exit free cam</li>
                  <li><kbd>F</kbd> — toggle free camera</li>
                  <li><kbd>H</kbd> / <kbd>?</kbd> — toggle this help</li>
                </ul>
              </div>
              <div className="help-footer">click anywhere to close</div>
            </div>
          </div>
        )}

        {freeCam && !showHelp && (
          <div className="freecam-hint">
            Free Cam · WASD walk · drag to look · Space/Q up/down · Shift sprint · ESC exit
          </div>
        )}

        <SidePanel session={selectedSession} logs={selectedLogs} onClose={() => setSelectedId(null)} />
      </div>
    </main>
  );
}

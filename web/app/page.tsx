'use client';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSessions, type LogEntry } from '@/lib/useSessions';
import { useNotifications } from '@/lib/useNotifications';
import SidePanel from '@/components/SidePanel';

const Scene = dynamic(() => import('@/components/Scene'), { ssr: false });

type CamMode = 'orbit' | 'fly' | 'walk';

export default function Page() {
  const { sessions, connected, logs, onEvent } = useSessions();
  const { enabled: notifyEnabled, toggle: toggleNotify, permission } = useNotifications();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pulses, setPulses] = useState<Record<string, number>>({});
  const [camMode, setCamMode] = useState<CamMode>('orbit');
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
      if (e.key === 'f' || e.key === 'F') setCamMode((m) => (m === 'fly' ? 'orbit' : 'fly'));
      if (e.key === 'g' || e.key === 'G') setCamMode((m) => (m === 'walk' ? 'orbit' : 'walk'));
      if (e.key === '?' || e.key === 'h' || e.key === 'H') setShowHelp((v) => !v);
      if (e.key === 'Escape') {
        if (selectedId) setSelectedId(null);
        else if (camMode !== 'orbit') setCamMode('orbit');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, camMode]);

  return (
    <main style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <Scene
        sessions={visibleSessions}
        selectedId={selectedId}
        onSelect={setSelectedId}
        pulses={pulses}
        camMode={camMode}
      />
      <div className="hud">
        <div className="toolbar">
          <h1>cc<span>·</span>3d <span style={{ marginLeft: 12, color: '#4a5a72', fontSize: 11 }}>live agent workspace</span></h1>
          <div className="meta">
            <span className="pill active">● {counts.active} active</span>
            <span className="pill idle">◐ {counts.idle} idle</span>

            <div className="cam-toggle" role="tablist">
              <button
                className={`cam-btn ${camMode === 'orbit' ? 'on' : ''}`}
                onClick={() => setCamMode('orbit')}
                title="Orbit camera (default)"
              >🌐 Orbit</button>
              <button
                className={`cam-btn ${camMode === 'fly' ? 'on' : ''}`}
                onClick={() => setCamMode('fly')}
                title="Free fly (F)"
              >🚁 Fly</button>
              <button
                className={`cam-btn ${camMode === 'walk' ? 'on' : ''}`}
                onClick={() => setCamMode('walk')}
                title="Walk in first-person (G)"
              >🚶 Walk</button>
            </div>

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
            >?</button>
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
                <h3>Cam modes</h3>
                <ul>
                  <li>🌐 <b>Orbit</b> — drag to rotate, scroll to zoom (default)</li>
                  <li>🚁 <b>Fly</b> (<kbd>F</kbd>) — WASD to move, drag to look, scroll to zoom forward, Space/Q up/down</li>
                  <li>🚶 <b>Walk</b> (<kbd>G</kbd>) — first-person ground walking, WASD, drag to look, Space to jump, Shift to sprint</li>
                </ul>
              </div>
              <div className="help-section">
                <h3>Interaction</h3>
                <ul>
                  <li>Click any character — open live event log</li>
                  <li><kbd>ESC</kbd> — close panel / back to orbit cam</li>
                  <li><kbd>H</kbd> / <kbd>?</kbd> — toggle this help</li>
                </ul>
              </div>
              <div className="help-section">
                <h3>What you see</h3>
                <ul>
                  <li>Each character = one Claude Code session</li>
                  <li>Skin color is unique per session ID (deterministic)</li>
                  <li>Hat = model: 👑 Opus · 🧢 Sonnet · 🟢 Haiku</li>
                  <li>Purple satellites = subagents</li>
                  <li>Glow pulse = a tool call just fired</li>
                  <li>Walks to the other room when status flips</li>
                </ul>
              </div>
              <div className="help-footer">click anywhere to close</div>
            </div>
          </div>
        )}

        {camMode === 'fly' && !showHelp && (
          <div className="freecam-hint">
            🚁 Fly · WASD walk · drag to look · scroll = forward · Space/Q up/down · Shift sprint · ESC exit
          </div>
        )}
        {camMode === 'walk' && !showHelp && (
          <div className="freecam-hint">
            🚶 Walk · WASD move · drag to look · Space jump · Shift sprint · click an agent to open · ESC exit
          </div>
        )}

        <SidePanel session={selectedSession} logs={selectedLogs} onClose={() => setSelectedId(null)} />
      </div>
    </main>
  );
}

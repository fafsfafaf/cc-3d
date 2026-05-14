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
  const [bubbles, setBubbles] = useState<Record<string, { text: string; key: number }>>({});
  const [camMode, setCamMode] = useState<CamMode>('orbit');
  const [whipEquipped, setWhipEquipped] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const lastStatusRef = useRef<Record<string, string>>({});
  const bubbleCounter = useRef(0);

  const activeAndIdle = useMemo(
    () => sessions.filter((s) => s.status === 'active' || s.status === 'idle'),
    [sessions],
  );

  const visibleSessions = useMemo(() => {
    if (!search.trim()) return activeAndIdle;
    const q = search.toLowerCase();
    return activeAndIdle.filter((s) => {
      return (
        (s.projectName || '').toLowerCase().includes(q) ||
        (s.sessionId || '').toLowerCase().includes(q) ||
        (s.model || '').toLowerCase().includes(q) ||
        (s.label || '').toLowerCase().includes(q) ||
        (s.externalKind || '').toLowerCase().includes(q) ||
        (s.lastToolCall?.name || '').toLowerCase().includes(q) ||
        (s.lastToolCall?.description || '').toLowerCase().includes(q) ||
        (s.currentTask || '').toLowerCase().includes(q)
      );
    });
  }, [activeAndIdle, search]);

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
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
      setPulses((prev) => ({ ...prev, [targetId]: now }));

      // Build a speech bubble text from the event
      let text: string | null = null;
      if (e.summary) {
        if (e.summary.kind === 'tool_use') {
          const desc = (e.summary.description || '').slice(0, 28);
          text = desc ? `${e.summary.name}: ${desc}` : `${e.summary.name}`;
        } else if (e.summary.kind === 'text' && e.summary.text) {
          text = String(e.summary.text).slice(0, 40);
        }
      }
      if (text) {
        bubbleCounter.current += 1;
        const key = bubbleCounter.current;
        setBubbles((prev) => ({ ...prev, [targetId]: { text: text!, key } }));
      }
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
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key === 'Escape') {
          (e.target as HTMLElement).blur();
          if (searchOpen) setSearchOpen(false);
        }
        return;
      }
      if (e.key === '/') {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
        return;
      }
      if (e.key === 'f' || e.key === 'F') setCamMode((m) => (m === 'fly' ? 'orbit' : 'fly'));
      if (e.key === 'g' || e.key === 'G') setCamMode((m) => (m === 'walk' ? 'orbit' : 'walk'));
      if (e.key === 't' || e.key === 'T') setWhipEquipped((v) => !v);
      if (e.key === '?' || e.key === 'h' || e.key === 'H') setShowHelp((v) => !v);
      if (e.key === 'Escape') {
        if (selectedId) setSelectedId(null);
        else if (searchOpen) { setSearchOpen(false); setSearch(''); }
        else if (camMode !== 'orbit') setCamMode('orbit');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, camMode, searchOpen]);

  return (
    <main style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <Scene
        sessions={visibleSessions}
        selectedId={selectedId}
        onSelect={setSelectedId}
        pulses={pulses}
        bubbles={bubbles}
        camMode={camMode}
        whipEquipped={whipEquipped && camMode === 'walk'}
      />
      <div className="hud">
        <div className="toolbar">
          <h1>cc<span>·</span>3d <span style={{ marginLeft: 12, color: '#4a5a72', fontSize: 11 }}>live agent workspace</span></h1>
          <div className="meta">
            <span className="pill active">● {counts.active} active</span>
            <span className="pill idle">◐ {counts.idle} idle</span>

            <div className="cam-toggle">
              <button className={`cam-btn ${camMode === 'orbit' ? 'on' : ''}`} onClick={() => setCamMode('orbit')} title="Orbit camera">🌐 Orbit</button>
              <button className={`cam-btn ${camMode === 'fly' ? 'on' : ''}`} onClick={() => setCamMode('fly')} title="Free fly (F)">🚁 Fly</button>
              <button className={`cam-btn ${camMode === 'walk' ? 'on' : ''}`} onClick={() => setCamMode('walk')} title="First-person walk (G)">🚶 Walk</button>
            </div>

            {camMode === 'walk' && (
              <button
                className={`notif-btn ${whipEquipped ? 'on' : ''}`}
                onClick={() => setWhipEquipped((v) => !v)}
                title="Equip / unequip whip (T) — click in scene to crack"
              >
                🪢 {whipEquipped ? 'Whip equipped' : 'Equip whip'}
              </button>
            )}

            <button
              className={`notif-btn ${searchOpen ? 'on' : ''}`}
              onClick={() => { setSearchOpen((v) => !v); setTimeout(() => searchInputRef.current?.focus(), 50); }}
              title="Search agents (/)"
            >🔍</button>

            <button
              className={`notif-btn ${notifyEnabled ? 'on' : ''}`}
              onClick={toggleNotify}
              title={permission === 'denied' ? 'Permission denied' : 'Toggle desktop notifications'}
            >
              <span className="dot" />
              {notifyEnabled ? 'Notifications ON' : permission === 'denied' ? 'Notifications BLOCKED' : 'Enable Notifications'}
            </button>
            <button className="notif-btn" onClick={() => setShowHelp((v) => !v)} title="Show controls (H)">?</button>
          </div>
        </div>

        {searchOpen && (
          <div className="search-bar">
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search by project, model, tool, task… (ESC to close)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <span className="search-count">
                {visibleSessions.length} / {activeAndIdle.length}
              </span>
            )}
          </div>
        )}

        <div className={`connection ${connected ? 'connected' : 'disconnected'}`}>
          {connected ? 'WebSocket connected · localhost:3435' : 'Reconnecting…'}
        </div>

        {visibleSessions.length === 0 && (
          <div className="empty-state">
            {search ? 'No matches for your search' : 'No active or idle sessions'}
          </div>
        )}

        {showHelp && (
          <div className="help-overlay" onClick={() => setShowHelp(false)}>
            <div className="help-card" onClick={(e) => e.stopPropagation()}>
              <h2>Controls</h2>
              <div className="help-section">
                <h3>Cam modes</h3>
                <ul>
                  <li>🌐 <b>Orbit</b> — drag to rotate, scroll to zoom (default)</li>
                  <li>🚁 <b>Fly</b> (<kbd>F</kbd>) — WASD to move, drag to look, scroll = forward, Space/Q up/down</li>
                  <li>🚶 <b>Walk</b> (<kbd>G</kbd>) — first-person ground walk, WASD, Space jump, Shift sprint</li>
                </ul>
              </div>
              <div className="help-section">
                <h3>Interaction</h3>
                <ul>
                  <li>Click any character — open live event log</li>
                  <li><kbd>/</kbd> — search agents</li>
                  <li><kbd>T</kbd> — equip / unequip whip (walk mode only)</li>
                  <li>Click in walk mode with whip equipped → crack + sound</li>
                  <li><kbd>ESC</kbd> — close panel / search / back to orbit</li>
                  <li><kbd>H</kbd> / <kbd>?</kbd> — toggle this help</li>
                </ul>
              </div>
              <div className="help-section">
                <h3>What you see</h3>
                <ul>
                  <li>Each character = one Claude Code session OR external agent</li>
                  <li>Sessions cluster by project (same project = same area)</li>
                  <li>Floor label below each cluster shows the project name</li>
                  <li>Skin color is unique per session (deterministic)</li>
                  <li>Hat = model: 👑 Opus · 🧢 Sonnet · 🟢 Haiku</li>
                  <li>External agents have their kind as hat (Marketing/Code/Review/…)</li>
                  <li>Speech bubble pops on tool calls</li>
                  <li>Walks to other room when status flips</li>
                </ul>
              </div>
              <div className="help-section">
                <h3>External Agents</h3>
                <ul>
                  <li>POST <code>http://localhost:3435/external/upsert</code></li>
                  <li>POST <code>http://localhost:3435/external/event</code></li>
                  <li>See <code>AGENTS.md</code> for full schema + example</li>
                </ul>
              </div>
              <div className="help-footer">click anywhere to close</div>
            </div>
          </div>
        )}

        {camMode === 'fly' && !showHelp && (
          <div className="freecam-hint">🚁 Fly · WASD walk · drag to look · scroll = forward · Space/Q up/down · Shift sprint · ESC exit</div>
        )}
        {camMode === 'walk' && !showHelp && (
          <div className="freecam-hint">🚶 Walk · WASD move · drag to look · Space jump · Shift sprint · click an agent · ESC exit</div>
        )}

        <SidePanel session={selectedSession} logs={selectedLogs} onClose={() => setSelectedId(null)} />
      </div>
    </main>
  );
}

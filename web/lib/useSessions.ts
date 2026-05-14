'use client';
import { useEffect, useRef, useState, useCallback } from 'react';

export type Subagent = {
  agentType: string;
  description: string;
  status: 'active' | 'idle' | 'done';
  lastEventAt: string | null;
  eventCount: number;
  lastToolCall: { name: string; description: string } | null;
};

export type Session = {
  sessionId: string;
  projectName: string;
  cwd: string;
  model: string;
  gitBranch: string | null;
  status: 'active' | 'idle' | 'done';
  lastEventAt: string | null;
  lastEventType: string;
  lastToolCall: { name: string; description: string; startedAt?: string } | null;
  lastUserPrompt: string | null;
  lastAssistantText: string | null;
  tokens: { input: number; output: number; cacheRead: number; cacheCreation: number };
  eventCount: number;
  subagents: Subagent[];
};

export type LogEntry = {
  id: string;
  sessionId: string;
  parentSessionId?: string;
  timestamp: string;
  eventType: string;
  summary: { kind: string; text?: string; name?: string; description?: string } | null;
  isSubagent?: boolean;
};

const WS_URL = `ws://${typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1'}:3435`;

export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [connected, setConnected] = useState(false);
  const [logs, setLogs] = useState<Record<string, LogEntry[]>>({});
  const wsRef = useRef<WebSocket | null>(null);
  const onEventRef = useRef<((e: LogEntry) => void) | null>(null);

  useEffect(() => {
    let stopped = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;
      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!stopped) reconnectTimer = setTimeout(connect, 1500);
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (m) => {
        try {
          const data = JSON.parse(m.data);
          if (data.type === 'snapshot') {
            setSessions(data.sessions);
          } else if (data.type === 'event' || data.type === 'subagent-event') {
            const targetId = data.parentSessionId || data.sessionId;
            const entry: LogEntry = {
              id: `${targetId}-${data.timestamp}-${Math.random().toString(36).slice(2, 8)}`,
              sessionId: data.sessionId || data.parentSessionId,
              parentSessionId: data.parentSessionId,
              timestamp: data.timestamp,
              eventType: data.eventType,
              summary: data.summary,
              isSubagent: data.type === 'subagent-event',
            };
            setLogs((prev) => {
              const arr = prev[targetId] || [];
              const next = [...arr, entry].slice(-200);
              return { ...prev, [targetId]: next };
            });
            onEventRef.current?.(entry);
          }
        } catch {
          /* ignore */
        }
      };
    };

    connect();
    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, []);

  const onEvent = useCallback((cb: (e: LogEntry) => void) => {
    onEventRef.current = cb;
  }, []);

  return { sessions, connected, logs, onEvent };
}

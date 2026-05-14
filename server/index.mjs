import http from 'node:http';
import { WebSocketServer } from 'ws';
import { SessionRegistry, TranscriptWatcher } from './registry.mjs';

const PORT = Number(process.env.CC3D_PORT || 3435);

const registry = new SessionRegistry();
const watcher = new TranscriptWatcher(registry);

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  if (req.url === '/health') {
    res.end(JSON.stringify({ ok: true, sessions: registry.all().length }));
    return;
  }
  if (req.url === '/snapshot') {
    res.end(JSON.stringify({ sessions: snapshot() }));
    return;
  }
  res.end(JSON.stringify({ ok: true }));
});

const wss = new WebSocketServer({ server });

const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => clients.delete(ws));
  // Send initial snapshot
  send(ws, { type: 'snapshot', sessions: snapshot() });
});

function broadcast(payload) {
  const data = JSON.stringify(payload);
  for (const c of clients) {
    if (c.readyState === 1) c.send(data);
  }
}

function send(ws, payload) {
  if (ws.readyState === 1) ws.send(JSON.stringify(payload));
}

function snapshot() {
  return registry
    .all()
    .filter((s) => s.status === 'active' || s.status === 'idle')
    .map(serialize)
    .sort((a, b) => new Date(b.lastEventAt || 0) - new Date(a.lastEventAt || 0));
}

function serialize(s) {
  return {
    sessionId: s.sessionId,
    projectName: s.projectName,
    cwd: s.cwd,
    model: s.model,
    gitBranch: s.gitBranch,
    status: s.status,
    lastEventAt: s.lastEventAt,
    lastEventType: s.lastEventType,
    lastToolCall: s.lastToolCall,
    lastUserPrompt: s.lastUserPrompt,
    lastAssistantText: s.lastAssistantText,
    tokens: s.tokens,
    eventCount: s.eventCount,
    subagents: (s.subagents || []).map((a) => ({
      agentType: a.agentType,
      description: a.description,
      status: a.status,
      lastEventAt: a.lastEventAt,
      eventCount: a.eventCount,
      lastToolCall: a.lastToolCall,
    })),
  };
}

let pendingBroadcast = null;
function scheduleBroadcast() {
  if (pendingBroadcast) return;
  pendingBroadcast = setTimeout(() => {
    pendingBroadcast = null;
    broadcast({ type: 'snapshot', sessions: snapshot() });
  }, 250);
}

watcher.on('session-event', ({ event }) => {
  scheduleBroadcast();
  if (event?.sessionId) {
    broadcast({
      type: 'event',
      sessionId: event.sessionId,
      timestamp: event.timestamp,
      eventType: event.type,
      summary: summarize(event),
    });
  }
});

watcher.on('subagent-event', ({ event, parentSessionId }) => {
  scheduleBroadcast();
  broadcast({
    type: 'subagent-event',
    parentSessionId,
    timestamp: event.timestamp,
    eventType: event.type,
    summary: summarize(event),
  });
});

registry.on('status-change', (session, prev) => {
  broadcast({
    type: 'status-change',
    sessionId: session.sessionId,
    prev: prev.status,
    next: session.status,
  });
});

setInterval(() => {
  registry.refreshStatuses();
  scheduleBroadcast();
}, 2000);

function summarize(event) {
  const msg = event?.message;
  if (!msg) return null;
  if (Array.isArray(msg.content)) {
    for (const part of msg.content) {
      if (part?.type === 'text' && part.text) return { kind: 'text', text: String(part.text).slice(0, 280) };
      if (part?.type === 'tool_use') return { kind: 'tool_use', name: part.name, description: pickDesc(part.input) };
      if (part?.type === 'tool_result') {
        const txt = typeof part.content === 'string'
          ? part.content
          : Array.isArray(part.content) ? part.content.map((p) => p.text || '').join(' ') : '';
        return { kind: 'tool_result', text: String(txt).slice(0, 280) };
      }
    }
  }
  if (typeof msg === 'string') return { kind: 'text', text: msg.slice(0, 280) };
  return null;
}

function pickDesc(input) {
  if (!input || typeof input !== 'object') return '';
  return (
    input.description ||
    input.command ||
    input.file_path ||
    input.pattern ||
    (input.prompt ? String(input.prompt).slice(0, 100) : '') ||
    ''
  );
}

watcher.start();

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[cc-3d] WebSocket + HTTP server listening on http://127.0.0.1:${PORT}`);
});

process.on('SIGINT', () => { watcher.stop(); server.close(); process.exit(0); });
process.on('SIGTERM', () => { watcher.stop(); server.close(); process.exit(0); });

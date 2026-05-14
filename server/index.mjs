import http from 'node:http';
import { WebSocketServer } from 'ws';
import { SessionRegistry, TranscriptWatcher } from './registry.mjs';
import { ExternalAgentRegistry, externalToSession } from './external.mjs';

const PORT = Number(process.env.CC3D_PORT || 3435);

const registry = new SessionRegistry();
const watcher = new TranscriptWatcher(registry);
const externals = new ExternalAgentRegistry();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204); res.end(); return;
  }

  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      return json(res, 200, { ok: true, sessions: registry.all().length, external: externals.all().length });
    }
    if (req.method === 'GET' && url.pathname === '/snapshot') {
      return json(res, 200, { sessions: snapshot() });
    }
    if (req.method === 'GET' && url.pathname === '/external') {
      return json(res, 200, { agents: externals.all() });
    }
    if (req.method === 'POST' && url.pathname === '/external/upsert') {
      const body = await readJson(req);
      if (!body?.agentId) return json(res, 400, { error: 'agentId required' });
      const a = externals.upsert(body);
      scheduleBroadcast();
      return json(res, 200, { ok: true, agent: a });
    }
    if (req.method === 'POST' && url.pathname === '/external/event') {
      const body = await readJson(req);
      if (!body?.agentId) return json(res, 400, { error: 'agentId required' });
      try {
        externals.event(body.agentId, body);
      } catch (e) {
        return json(res, 404, { error: e.message });
      }
      scheduleBroadcast();
      const ext = externals.get(body.agentId);
      broadcast({
        type: 'event',
        sessionId: `ext:${ext.agentId}`,
        timestamp: ext.lastEventAt,
        eventType: ext.lastEventType,
        summary: body.summary || (ext.lastToolCall ? { kind: 'tool_use', name: ext.lastToolCall.name, description: ext.lastToolCall.description } : { kind: 'text', text: ext.currentTask || '' }),
      });
      return json(res, 200, { ok: true });
    }
    if (req.method === 'DELETE' && url.pathname.startsWith('/external/')) {
      const id = url.pathname.replace('/external/', '');
      const ok = externals.remove(id);
      scheduleBroadcast();
      return json(res, ok ? 200 : 404, { ok });
    }
    if (req.method === 'GET' && url.pathname === '/') {
      return json(res, 200, {
        ok: true,
        endpoints: [
          'GET  /health',
          'GET  /snapshot',
          'GET  /external',
          'POST /external/upsert     { agentId, kind?, projectName?, label?, model?, currentTask? }',
          'POST /external/event      { agentId, eventType?, toolCall?, task?, tokens?, summary? }',
          'DELETE /external/:agentId',
        ],
        websocket: `ws://127.0.0.1:${PORT}`,
      });
    }
    return json(res, 404, { error: 'not found' });
  } catch (err) {
    return json(res, 500, { error: String(err?.message || err) });
  }
});

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error('invalid JSON')); }
    });
    req.on('error', reject);
  });
}

const wss = new WebSocketServer({ server });
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => clients.delete(ws));
  send(ws, { type: 'snapshot', sessions: snapshot() });
});

function broadcast(payload) {
  const data = JSON.stringify(payload);
  for (const c of clients) if (c.readyState === 1) c.send(data);
}

function send(ws, payload) {
  if (ws.readyState === 1) ws.send(JSON.stringify(payload));
}

function snapshot() {
  const claudeSessions = registry
    .all()
    .filter((s) => s.status === 'active' || s.status === 'idle')
    .map(serialize);
  const extSessions = externals
    .all()
    .filter((a) => a.status === 'active' || a.status === 'idle')
    .map(externalToSession);
  return [...claudeSessions, ...extSessions]
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
  broadcast({ type: 'status-change', sessionId: session.sessionId, prev: prev.status, next: session.status });
});

setInterval(() => {
  registry.refreshStatuses();
  externals.refreshStatuses();
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
        const txt = typeof part.content === 'string' ? part.content : Array.isArray(part.content) ? part.content.map((p) => p.text || '').join(' ') : '';
        return { kind: 'tool_result', text: String(txt).slice(0, 280) };
      }
    }
  }
  if (typeof msg === 'string') return { kind: 'text', text: msg.slice(0, 280) };
  return null;
}

function pickDesc(input) {
  if (!input || typeof input !== 'object') return '';
  return input.description || input.command || input.file_path || input.pattern || (input.prompt ? String(input.prompt).slice(0, 100) : '') || '';
}

watcher.start();

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[cc-3d] HTTP+WS server on http://127.0.0.1:${PORT}`);
  console.log(`[cc-3d] External agents endpoint:  http://127.0.0.1:${PORT}/external`);
});

process.on('SIGINT', () => { watcher.stop(); server.close(); process.exit(0); });
process.on('SIGTERM', () => { watcher.stop(); server.close(); process.exit(0); });

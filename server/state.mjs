import { EventEmitter } from 'node:events';
import { projectName } from './format.mjs';

const ACTIVE_THRESHOLD_MS = 5_000;
const IDLE_THRESHOLD_MS = 2 * 60_000;

export class SessionRegistry extends EventEmitter {
  constructor() {
    super();
    this.sessions = new Map();
    this.subagentByFile = new Map();
  }

  upsert(sessionId, patch) {
    const existing = this.sessions.get(sessionId);
    const prev = existing ? { ...existing } : null;
    const next = {
      sessionId,
      projectName: 'unknown',
      cwd: null,
      model: null,
      gitBranch: null,
      filePath: null,
      lastEventAt: null,
      lastEventType: null,
      lastToolCall: null,
      lastUserPrompt: null,
      lastAssistantText: null,
      tokens: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
      eventCount: 0,
      status: 'active',
      subagents: [],
      ...existing,
      ...patch,
    };
    next.status = computeStatus(next.lastEventAt);
    this.sessions.set(sessionId, next);
    this.emit('update', next, prev);
    if (prev && prev.status !== next.status) {
      this.emit('status-change', next, prev);
    }
    return next;
  }

  get(sessionId) {
    return this.sessions.get(sessionId);
  }

  all() {
    return [...this.sessions.values()];
  }

  attachSubagent(parentSessionId, filePath, meta) {
    const parent = this.sessions.get(parentSessionId);
    if (!parent) return;
    let entry = this.subagentByFile.get(filePath);
    if (!entry) {
      entry = {
        filePath,
        agentType: meta?.agentType || 'agent',
        description: meta?.description || '',
        startedAt: Date.now(),
        lastEventAt: Date.now(),
        status: 'active',
        eventCount: 0,
      };
      this.subagentByFile.set(filePath, entry);
      parent.subagents = [...(parent.subagents || []), entry];
    }
    return entry;
  }

  updateSubagent(filePath, patch) {
    const entry = this.subagentByFile.get(filePath);
    if (!entry) return null;
    Object.assign(entry, patch);
    entry.status = computeStatus(entry.lastEventAt);
    return entry;
  }

  refreshStatuses() {
    const changes = [];
    for (const s of this.sessions.values()) {
      const next = computeStatus(s.lastEventAt);
      if (next !== s.status) {
        const prev = { ...s };
        s.status = next;
        changes.push({ session: s, prevStatus: prev.status });
        this.emit('status-change', s, prev);
      }
    }
    for (const a of this.subagentByFile.values()) {
      a.status = computeStatus(a.lastEventAt);
    }
    return changes;
  }
}

export function computeStatus(lastEventAt) {
  if (!lastEventAt) return 'idle';
  const diff = Date.now() - new Date(lastEventAt).getTime();
  if (diff < ACTIVE_THRESHOLD_MS) return 'active';
  if (diff < IDLE_THRESHOLD_MS) return 'idle';
  return 'done';
}

export { ACTIVE_THRESHOLD_MS, IDLE_THRESHOLD_MS };
export { projectName };

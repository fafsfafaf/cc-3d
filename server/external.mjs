// External agent registry — for agents that aren't Claude Code sessions.
// Anyone can POST to /external/upsert and /external/event to make their agent
// appear in cc-3d alongside Claude Code sessions.

import { EventEmitter } from 'node:events';

const ACTIVE_THRESHOLD_MS = 15_000;
const IDLE_THRESHOLD_MS = 3 * 60_000;

export class ExternalAgentRegistry extends EventEmitter {
  constructor() {
    super();
    this.agents = new Map(); // agentId -> agent
  }

  upsert(input) {
    const { agentId } = input;
    if (!agentId) throw new Error('agentId required');
    const existing = this.agents.get(agentId);
    const now = Date.now();
    const next = {
      // Defaults
      agentId,
      kind: input.kind || 'external', // 'external' | 'marketing' | 'code' | 'review' | 'data' | ...
      projectName: input.projectName || input.project || 'External',
      label: input.label || input.name || agentId,
      model: input.model || input.kind || 'external',
      currentTask: input.currentTask || input.task || null,
      tokens: input.tokens || existing?.tokens || { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
      eventCount: existing?.eventCount || 0,
      lastEventAt: input.lastEventAt || existing?.lastEventAt || new Date(now).toISOString(),
      lastEventType: input.lastEventType || existing?.lastEventType || 'register',
      lastToolCall: input.lastToolCall || existing?.lastToolCall || null,
      meta: { ...(existing?.meta || {}), ...(input.meta || {}) },
      ...existing, // keep server-derived fields
      ...input,
      agentId, // re-pin
    };
    next.status = computeStatus(next.lastEventAt);
    this.agents.set(agentId, next);
    this.emit('update', next, existing || null);
    return next;
  }

  event(agentId, payload) {
    const a = this.agents.get(agentId);
    if (!a) throw new Error(`unknown agentId: ${agentId}`);
    a.eventCount = (a.eventCount || 0) + 1;
    a.lastEventAt = payload.timestamp || new Date().toISOString();
    a.lastEventType = payload.eventType || payload.type || 'event';
    if (payload.toolCall) a.lastToolCall = payload.toolCall;
    if (payload.task) a.currentTask = payload.task;
    if (payload.tokens) {
      a.tokens.input += payload.tokens.input || 0;
      a.tokens.output += payload.tokens.output || 0;
      a.tokens.cacheRead += payload.tokens.cacheRead || 0;
      a.tokens.cacheCreation += payload.tokens.cacheCreation || 0;
    }
    a.status = computeStatus(a.lastEventAt);
    this.emit('event', a, payload);
    return a;
  }

  remove(agentId) {
    const ok = this.agents.delete(agentId);
    if (ok) this.emit('remove', agentId);
    return ok;
  }

  all() {
    return [...this.agents.values()];
  }

  get(agentId) {
    return this.agents.get(agentId);
  }

  refreshStatuses() {
    for (const a of this.agents.values()) {
      a.status = computeStatus(a.lastEventAt);
    }
  }
}

function computeStatus(lastEventAt) {
  if (!lastEventAt) return 'idle';
  const diff = Date.now() - new Date(lastEventAt).getTime();
  if (diff < ACTIVE_THRESHOLD_MS) return 'active';
  if (diff < IDLE_THRESHOLD_MS) return 'idle';
  return 'done';
}

// Convert external agent to the same Session shape used by the rest of the app.
// kind drives both projectName fallback AND visual style (color, hat).
export function externalToSession(a) {
  return {
    sessionId: `ext:${a.agentId}`,
    projectName: a.projectName,
    cwd: null,
    model: a.model || a.kind,
    gitBranch: a.meta?.branch || null,
    status: a.status,
    lastEventAt: a.lastEventAt,
    lastEventType: a.lastEventType,
    lastToolCall: a.lastToolCall,
    lastUserPrompt: a.currentTask ? `Task: ${a.currentTask}` : null,
    lastAssistantText: a.meta?.lastMessage || null,
    tokens: a.tokens,
    eventCount: a.eventCount,
    subagents: [],
    // Extra fields for rendering
    isExternal: true,
    externalKind: a.kind,
    label: a.label,
    currentTask: a.currentTask,
  };
}

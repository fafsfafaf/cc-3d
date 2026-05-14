import path from 'node:path';
import chokidar from 'chokidar';
import { EventEmitter } from 'node:events';
import {
  ensureProjectsRoot,
  isSubagentFile,
  loadSubagentMeta,
  parentSessionFromSubagentPath,
  parseLine,
  readNewLines,
  extractSessionPatch,
  resetOffsets,
} from './parser.mjs';

export class TranscriptWatcher extends EventEmitter {
  constructor(registry, opts = {}) {
    super();
    this.registry = registry;
    this.root = opts.root || ensureProjectsRoot();
    this.usePolling = opts.usePolling || false;
    this.watcher = null;
  }

  start() {
    const glob = path.join(this.root, '**', '*.jsonl').replace(/\\/g, '/');
    this.watcher = chokidar.watch(glob, {
      usePolling: this.usePolling,
      interval: 500,
      binaryInterval: 1500,
      awaitWriteFinish: false,
      ignoreInitial: false,
      depth: 6,
    });

    this.watcher.on('add', (file) => this.handleFile(file, true));
    this.watcher.on('change', (file) => this.handleFile(file, false));
    this.watcher.on('unlink', (file) => {
      resetOffsets(file);
      this.emit('unlink', file);
    });
    this.watcher.on('error', (err) => this.emit('error', err));
    this.watcher.on('ready', () => this.emit('ready'));
  }

  stop() {
    if (this.watcher) this.watcher.close();
  }

  handleFile(file, isAdd) {
    const lines = readNewLines(file, isAdd);
    if (!lines.length) return;
    const subagent = isSubagentFile(file);
    if (subagent) {
      this.processSubagentLines(file, lines, isAdd);
    } else {
      this.processSessionLines(file, lines);
    }
  }

  processSessionLines(file, lines) {
    let lastEvent = null;
    for (const raw of lines) {
      const event = parseLine(raw);
      if (!event) continue;
      lastEvent = event;
      const patch = extractSessionPatch(event, file);
      if (!patch) continue;
      const existing = this.registry.get(patch.sessionId);
      const eventCount = (existing?.eventCount || 0) + 1;
      const tokens = mergeTokens(existing?.tokens, patch.usageDelta);
      delete patch.usageDelta;
      this.registry.upsert(patch.sessionId, {
        ...patch,
        eventCount,
        tokens,
      });
      this.emit('session-event', { event, file });
    }
    if (lastEvent) this.emit('session-tick', { file });
  }

  processSubagentLines(file, lines, isAdd) {
    const parentSessionId = parentSessionFromSubagentPath(file);
    if (!parentSessionId) return;
    let parent = this.registry.get(parentSessionId);
    if (!parent) {
      parent = this.registry.upsert(parentSessionId, {
        sessionId: parentSessionId,
      });
    }
    const meta = loadSubagentMeta(file);
    const entry = this.registry.attachSubagent(parentSessionId, file, meta);
    if (!entry) return;

    let lastTimestamp = null;
    let lastToolCall = null;
    let assistantText = null;
    let userPrompt = null;
    for (const raw of lines) {
      const event = parseLine(raw);
      if (!event) continue;
      entry.eventCount = (entry.eventCount || 0) + 1;
      if (event.timestamp) lastTimestamp = event.timestamp;
      const msg = event.message;
      if (msg && Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part?.type === 'tool_use') {
            lastToolCall = {
              name: part.name,
              description: pickDesc(part.input),
            };
          }
          if (part?.type === 'text' && part.text) {
            if (event.type === 'assistant') assistantText = part.text.slice(0, 200);
            if (event.type === 'user') userPrompt = part.text.slice(0, 200);
          }
        }
      }
      this.emit('subagent-event', { event, file, parentSessionId });
    }
    this.registry.updateSubagent(file, {
      lastEventAt: lastTimestamp || new Date().toISOString(),
      lastToolCall,
      lastAssistantText: assistantText,
      lastUserPrompt: userPrompt,
    });
    if (lastTimestamp) {
      this.registry.upsert(parentSessionId, {
        sessionId: parentSessionId,
        lastEventAt: lastTimestamp,
      });
    }
  }
}

function mergeTokens(existing, delta) {
  if (!delta) return existing || { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 };
  const base = existing || { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 };
  return {
    input: base.input + (delta.input || 0),
    output: base.output + (delta.output || 0),
    cacheRead: base.cacheRead + (delta.cacheRead || 0),
    cacheCreation: base.cacheCreation + (delta.cacheCreation || 0),
  };
}

function pickDesc(input) {
  if (!input || typeof input !== 'object') return '';
  return (
    input.description ||
    input.command ||
    input.file_path ||
    input.pattern ||
    (input.prompt ? String(input.prompt).slice(0, 80) : '') ||
    ''
  );
}

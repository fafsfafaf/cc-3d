import fs from 'node:fs';
import path from 'node:path';
import { projectName } from './format.mjs';

const offsets = new Map();
const buffers = new Map();

export function isSubagentFile(filePath) {
  return filePath.replace(/\\/g, '/').includes('/subagents/');
}

export function parentSessionFromSubagentPath(filePath) {
  const parts = filePath.replace(/\\/g, '/').split('/');
  const idx = parts.lastIndexOf('subagents');
  if (idx < 1) return null;
  return parts[idx - 1];
}

export function loadSubagentMeta(filePath) {
  const metaPath = filePath.replace(/\.jsonl$/, '.meta.json');
  try {
    const raw = fs.readFileSync(metaPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function readNewLines(filePath, fromStart = false) {
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    offsets.delete(filePath);
    buffers.delete(filePath);
    return [];
  }
  const previousOffset = fromStart ? 0 : offsets.get(filePath) || 0;
  if (stat.size < previousOffset) {
    offsets.set(filePath, 0);
    buffers.set(filePath, '');
    return readNewLines(filePath, true);
  }
  if (stat.size === previousOffset) return [];

  const fd = fs.openSync(filePath, 'r');
  try {
    const length = stat.size - previousOffset;
    const buf = Buffer.alloc(length);
    fs.readSync(fd, buf, 0, length, previousOffset);
    offsets.set(filePath, stat.size);
    const carry = buffers.get(filePath) || '';
    const text = carry + buf.toString('utf8');
    const lines = text.split('\n');
    const lastPartial = lines.pop();
    buffers.set(filePath, lastPartial || '');
    return lines.filter(Boolean);
  } finally {
    fs.closeSync(fd);
  }
}

export function parseLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

export function extractSessionPatch(event, filePath) {
  if (!event) return null;
  const sessionId = event.sessionId;
  if (!sessionId) return null;

  const patch = {
    sessionId,
    filePath,
    eventCount: 1,
  };

  if (event.cwd) {
    patch.cwd = event.cwd;
    patch.projectName = projectName(event.cwd);
  }
  if (event.gitBranch) patch.gitBranch = event.gitBranch;
  if (event.timestamp) patch.lastEventAt = event.timestamp;
  if (event.type) patch.lastEventType = event.type;

  const msg = event.message;
  if (msg && typeof msg === 'object') {
    if (msg.model) patch.model = msg.model;
    if (msg.usage) {
      patch.usageDelta = {
        input: msg.usage.input_tokens || 0,
        output: msg.usage.output_tokens || 0,
        cacheRead: msg.usage.cache_read_input_tokens || 0,
        cacheCreation: msg.usage.cache_creation_input_tokens || 0,
      };
    }

    if (event.type === 'user') {
      const text = extractText(msg.content);
      if (text) patch.lastUserPrompt = text.slice(0, 280);
    }
    if (event.type === 'assistant') {
      const text = extractText(msg.content);
      if (text) patch.lastAssistantText = text.slice(0, 280);
      const toolUse = extractToolUse(msg.content);
      if (toolUse) {
        patch.lastToolCall = {
          name: toolUse.name,
          description: pickDescription(toolUse.input),
          startedAt: event.timestamp,
        };
      }
    }
  }

  return patch;
}

function extractText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return null;
  const parts = [];
  for (const part of content) {
    if (typeof part === 'string') parts.push(part);
    else if (part?.type === 'text' && part.text) parts.push(part.text);
  }
  return parts.join(' ').trim();
}

function extractToolUse(content) {
  if (!Array.isArray(content)) return null;
  for (const part of content) {
    if (part?.type === 'tool_use') return part;
  }
  return null;
}

function pickDescription(input) {
  if (!input || typeof input !== 'object') return '';
  if (input.description) return String(input.description);
  if (input.command) return String(input.command).slice(0, 120);
  if (input.file_path) return String(input.file_path);
  if (input.pattern) return `pattern: ${input.pattern}`;
  if (input.prompt) return String(input.prompt).slice(0, 120);
  if (input.url) return String(input.url);
  return '';
}

export function resetOffsets(filePath) {
  if (filePath) {
    offsets.delete(filePath);
    buffers.delete(filePath);
  } else {
    offsets.clear();
    buffers.clear();
  }
}

export function ensureProjectsRoot() {
  const home = process.env.USERPROFILE || process.env.HOME;
  if (!home) throw new Error('No HOME / USERPROFILE env');
  return path.join(home, '.claude', 'projects');
}

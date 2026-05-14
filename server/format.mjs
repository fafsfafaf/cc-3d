// chalk is only needed for the cc-monitor terminal UI; cc-3d server has no use for it.
// Use a tiny stub so this file remains drop-in compatible.
const chalk = new Proxy({}, { get: () => (s) => s });

export function timeAgo(timestamp) {
  if (!timestamp) return '?';
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diff = Math.max(0, now - then);
  const s = Math.floor(diff / 1000);
  if (s < 1) return 'now';
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m${s % 60 ? ` ${s % 60}s` : ''}`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

export function shortId(id, len = 8) {
  if (!id) return '????????';
  return id.slice(0, len);
}

export function modelLabel(model) {
  if (!model) return 'unknown';
  return model
    .replace('claude-', '')
    .replace(/-2025\d+/, '')
    .replace(/-\d{8}$/, '');
}

export function projectName(cwd) {
  if (!cwd) return 'unknown';
  const norm = cwd.replace(/\\/g, '/').replace(/\/$/, '');
  return norm.split('/').filter(Boolean).pop() || 'unknown';
}

export function formatTokens(t = {}) {
  const total = (t.input || 0) + (t.output || 0);
  const cache = (t.cacheRead || 0) + (t.cacheCreation || 0);
  const fmt = (n) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return String(n);
  };
  return `${fmt(total)} (cache ${fmt(cache)})`;
}

export function statusIcon(status) {
  switch (status) {
    case 'active':
      return chalk.green('●');
    case 'idle':
      return chalk.yellow('◐');
    case 'done':
      return chalk.gray('○');
    default:
      return chalk.gray('?');
  }
}

export function statusColor(status, text) {
  switch (status) {
    case 'active':
      return chalk.green(text);
    case 'idle':
      return chalk.yellow(text);
    case 'done':
      return chalk.gray(text);
    default:
      return text;
  }
}

export function eventTypeColor(type, text) {
  switch (type) {
    case 'user':
      return chalk.cyan(text);
    case 'assistant':
      return chalk.white(text);
    case 'tool_use':
      return chalk.magenta(text);
    case 'tool_result':
      return chalk.blue(text);
    case 'system':
      return chalk.gray(text);
    default:
      return chalk.dim(text);
  }
}

export function truncate(str, max) {
  if (!str) return '';
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + '…';
}

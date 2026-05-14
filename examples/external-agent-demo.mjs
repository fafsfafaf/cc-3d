#!/usr/bin/env node
// Example external agent — spawns 3 fake bots that show up in cc-3d.
// Usage: node examples/external-agent-demo.mjs
// Stop: Ctrl+C

const BASE = process.env.CC3D_BASE || 'http://127.0.0.1:3435';

const bots = [
  { agentId: 'demo-marketing', kind: 'marketing', projectName: 'Q4 Campaign', label: 'Pia (Marketing)' },
  { agentId: 'demo-codereview', kind: 'review', projectName: 'PR Reviews', label: 'Code Reviewer' },
  { agentId: 'demo-data', kind: 'data', projectName: 'Analytics ETL', label: 'Data Pipeline' },
];

async function upsert(bot, extra = {}) {
  const res = await fetch(`${BASE}/external/upsert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...bot, ...extra }),
  });
  if (!res.ok) console.error('upsert failed:', await res.text());
}

async function event(agentId, payload) {
  const res = await fetch(`${BASE}/external/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId, ...payload }),
  });
  if (!res.ok) console.error('event failed:', await res.text());
}

const fakeTasks = {
  'demo-marketing': [
    { task: 'Drafting newsletter', tool: 'OpenAI', desc: 'compose subject line' },
    { task: 'A/B testing copy', tool: 'Mailgun', desc: 'send variant A' },
    { task: 'Analyzing CTR', tool: 'GA4', desc: 'fetch yesterday metrics' },
  ],
  'demo-codereview': [
    { task: 'Reviewing PR #482', tool: 'GitHub', desc: 'fetch diff' },
    { task: 'Linting', tool: 'ESLint', desc: 'src/api/users.ts' },
    { task: 'Posting comment', tool: 'GitHub', desc: 'add review feedback' },
  ],
  'demo-data': [
    { task: 'Loading CSV', tool: 'pandas', desc: 'orders_2026.csv (1.2GB)' },
    { task: 'Aggregating', tool: 'DuckDB', desc: 'SELECT region, SUM(total)' },
    { task: 'Writing to S3', tool: 'boto3', desc: 's3://reports/q4.parquet' },
  ],
};

async function loop() {
  for (const bot of bots) {
    try { await upsert(bot, { currentTask: 'Initializing…' }); }
    catch (e) { console.error('Server unreachable. Make sure cc-3d is running.'); process.exit(1); }
  }
  console.log(`[demo] 3 bots registered with ${BASE}`);
  console.log('[demo] Open cc-3d in your browser — they should appear within 1s');
  console.log('[demo] Press Ctrl+C to stop');

  while (true) {
    for (const bot of bots) {
      const tasks = fakeTasks[bot.agentId];
      const t = tasks[Math.floor(Math.random() * tasks.length)];
      await upsert(bot, { currentTask: t.task });
      await event(bot.agentId, {
        eventType: 'tool_use',
        toolCall: { name: t.tool, description: t.desc },
        tokens: { input: 50 + Math.floor(Math.random() * 200), output: 20 + Math.floor(Math.random() * 100) },
      });
      await new Promise((r) => setTimeout(r, 800 + Math.random() * 1200));
    }
  }
}

process.on('SIGINT', async () => {
  console.log('\n[demo] cleaning up…');
  for (const bot of bots) {
    try { await fetch(`${BASE}/external/${bot.agentId}`, { method: 'DELETE' }); } catch {}
  }
  process.exit(0);
});

loop();

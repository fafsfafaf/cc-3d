#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import open from 'open';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const webDir = path.join(root, 'web');

const args = process.argv.slice(2);
const noOpen = args.includes('--no-open');
const dev = args.includes('--dev');
const port = 3434;
const wsPort = 3435;

if (args.includes('--help') || args.includes('-h')) {
  console.log(`cc-3d -- 3D web dashboard for live Claude Code sessions

Usage:
  cc-3d                Start server + web (production build) and open browser
  cc-3d --dev          Start in dev mode (Next.js dev server, hot reload)
  cc-3d --no-open      Don't auto-open the browser
  cc-3d --help         This help

Ports:
  ${port}  Web UI    (http://localhost:${port})
  ${wsPort}  WebSocket (auto-connected by web UI)

Stop with Ctrl+C.
`);
  process.exit(0);
}

if (!fs.existsSync(path.join(webDir, 'node_modules'))) {
  console.log('[cc-3d] First run — installing web dependencies (this can take a minute)…');
  const install = spawn('npm', ['install', '--no-fund', '--no-audit'], {
    cwd: webDir,
    stdio: 'inherit',
    shell: true,
  });
  install.on('exit', (code) => {
    if (code !== 0) {
      console.error('[cc-3d] npm install failed');
      process.exit(1);
    }
    startAll();
  });
} else {
  startAll();
}

function startAll() {
  const procs = [];

  console.log('[cc-3d] Starting WebSocket server on port', wsPort);
  const server = spawn('node', [path.join(root, 'server', 'index.mjs')], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, CC3D_PORT: String(wsPort) },
    shell: false,
  });
  procs.push(server);

  if (dev) {
    console.log('[cc-3d] Starting Next.js dev server on port', port);
    const web = spawn('npm', ['run', 'dev'], {
      cwd: webDir,
      stdio: 'inherit',
      shell: true,
    });
    procs.push(web);
  } else {
    if (!fs.existsSync(path.join(webDir, '.next'))) {
      console.log('[cc-3d] No production build found — building (this can take a minute)…');
      const build = spawn('npm', ['run', 'build'], {
        cwd: webDir,
        stdio: 'inherit',
        shell: true,
      });
      build.on('exit', (code) => {
        if (code !== 0) {
          console.error('[cc-3d] Build failed');
          procs.forEach((p) => p.kill());
          process.exit(1);
        }
        startWebProd();
      });
    } else {
      startWebProd();
    }

    function startWebProd() {
      console.log('[cc-3d] Starting Next.js production server on port', port);
      const web = spawn('npm', ['run', 'start'], {
        cwd: webDir,
        stdio: 'inherit',
        shell: true,
      });
      procs.push(web);
      if (!noOpen) setTimeout(() => open(`http://localhost:${port}`).catch(() => {}), 2500);
    }
  }

  if (dev && !noOpen) {
    setTimeout(() => open(`http://localhost:${port}`).catch(() => {}), 4000);
  }

  const cleanup = () => {
    procs.forEach((p) => { try { p.kill(); } catch { /* ignore */ } });
    setTimeout(() => process.exit(0), 200);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

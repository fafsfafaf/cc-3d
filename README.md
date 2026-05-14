# cc-3d

> Live 3D agent workspace for Claude Code. Watch your active sessions and
> their subagents as voxel characters living in two virtual rooms — in real
> time, in your browser, fully local.

![status](https://img.shields.io/badge/status-experimental-orange) ![license](https://img.shields.io/badge/license-MIT-blue) ![node](https://img.shields.io/badge/node-%3E%3D18-339933) ![next](https://img.shields.io/badge/next-14-black)

---

## What it does

`cc-3d` watches `~/.claude/projects/**/*.jsonl` (the transcripts that Claude
Code writes for every session) and renders the **active** and **idle**
sessions as 3D voxel characters in a Minecraft-style scene:

- **ACTIVE WORKSHOP** (warm orange room): sessions that did something in the last 5s — characters bounce + their arms swing as if typing
- **IDLE OFFICE** (cool blue room): sessions idle for 5s–2min — characters stand calm, occasionally look around
- **Done sessions are hidden** (configurable threshold)
- **Subagents** orbit their parent agent as smaller companions in purple capes
- Each character has a **deterministic skin** generated from the session ID — `e6d1fa09` always looks the same
- **Hats** indicate the model: orange crown = Opus, blue cap = Sonnet, green bandana = Haiku
- Tool calls trigger a **glow pulse** on the agent's floor ring
- Click any character → side panel with the **live event stream**
- **Browser desktop notifications** when a session goes from active → idle/done

## Why

If you're like me you have 5+ Claude sessions running at once across IDE
windows, terminal tabs, and remote machines. There's no way to glance at one
screen and see *which agents are working on what right now*. `cc-3d` is that
glance — a live, ambient, low-cognitive-overhead dashboard.

## Quick start

```bash
git clone https://github.com/<your-username>/cc-3d.git
cd cc-3d
npm install
npm link            # makes `cc-3d` available globally
cc-3d               # builds + starts + opens the browser
```

The first run installs the web dependencies and builds the Next.js bundle —
takes about a minute. Subsequent runs are instant. Stop with `Ctrl+C`.

The web UI opens at <http://localhost:3434> and connects to a local WebSocket
server on `:3435` that streams events from your transcripts.

### Modes

```bash
cc-3d              # production build, fast (default)
cc-3d --dev        # Next.js dev server with hot reload
cc-3d --no-open    # don't auto-open the browser
cc-3d --help
```

## Controls

### Orbit camera (default)
| Key                 | Action                       |
|---------------------|------------------------------|
| Drag                | rotate around scene          |
| Right-drag          | pan                          |
| Scroll              | zoom                         |

### Free camera (press F to toggle)
| Key                 | Action                       |
|---------------------|------------------------------|
| `W` `A` `S` `D`     | walk                         |
| Drag                | look around                  |
| `Space` / `E`       | up                           |
| `Q` / `Ctrl`        | down                         |
| `Shift`             | sprint                       |

### Misc
| Key                 | Action                       |
|---------------------|------------------------------|
| Click character     | open side panel              |
| `ESC`               | close panel / exit free cam  |
| `H` or `?`          | toggle help                  |
| `n` (in toolbar)    | toggle desktop notifications |

## Architecture

```
cc-3d/
├── bin/
│   └── cc-3d.mjs            # CLI launcher (spawns server + web, opens browser)
├── server/
│   ├── index.mjs            # WebSocket + HTTP server, broadcasts events
│   ├── registry.mjs         # Public re-exports
│   ├── state.mjs            # In-memory session registry (EventEmitter)
│   ├── parser.mjs           # JSONL incremental tail-parser
│   ├── watcher.mjs          # chokidar wiring
│   └── format.mjs           # formatting helpers
├── web/                     # Next.js 14 app
│   ├── app/
│   │   ├── page.tsx         # Main scene + HUD + sidepanel
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── Scene.tsx        # Three.js scene (rooms, lights, layout)
│   │   ├── VoxelAgent.tsx   # Procedural voxel character (procedural)
│   │   ├── VoxelSubagent.tsx# Smaller companion that orbits a parent
│   │   ├── FreeCameraControls.tsx # WASD + mouse-look
│   │   └── SidePanel.tsx    # Live event log
│   └── lib/
│       ├── useSessions.ts          # WebSocket hook
│       └── useNotifications.ts     # Browser Notifications API
├── package.json
└── README.md
```

### Data flow

```
~/.claude/projects/*.jsonl
        │ (chokidar watches for new lines)
        ▼
parser.mjs (extracts events from JSONL tail)
        │
        ▼
state.mjs (in-memory session registry)
        │ (EventEmitter)
        ▼
server/index.mjs (WebSocket + HTTP)
        │ (snapshot + event broadcast)
        ▼
web/lib/useSessions.ts (React hook)
        │
        ▼
web/components/Scene.tsx (Three.js render)
```

### What is parsed

Each `.jsonl` line is a single event. We extract:

- `sessionId` (the directory + file name)
- `cwd` (project working directory → "project name" = last path segment)
- `model` (e.g. `claude-opus-4-7`) — drives the hat
- `gitBranch`
- `timestamp` (drives status: active/idle/done)
- `message.usage` (cumulative token counters)
- `message.content[]` for text + `tool_use` + `tool_result` (drives the side panel log)

Subagents live in `<session-id>/subagents/agent-<hash>.jsonl` with a sibling
`.meta.json` that contains `agentType` and `description`.

## Embedding / extending

### Use the WebSocket as an integration point

The server speaks a tiny protocol on `ws://localhost:3435`:

```ts
// On connect, server sends:
{ type: 'snapshot', sessions: Session[] }

// Then continuously:
{ type: 'snapshot', sessions: Session[] }            // throttled re-snapshots
{ type: 'event', sessionId, timestamp, eventType, summary }
{ type: 'subagent-event', parentSessionId, timestamp, eventType, summary }
{ type: 'status-change', sessionId, prev, next }
```

REST endpoints:

```
GET /health     → { ok, sessions }
GET /snapshot   → { sessions }
```

This means you can plug `cc-3d`'s data feed into your own tool — e.g. a
Slack bot, a different visualization, or a status dashboard. Just connect to
the WebSocket and read `Session` objects:

```ts
type Session = {
  sessionId: string;
  projectName: string;
  cwd: string;
  model: string;
  gitBranch: string | null;
  status: 'active' | 'idle' | 'done';
  lastEventAt: string;
  lastEventType: string;
  lastToolCall: { name: string; description: string } | null;
  tokens: { input; output; cacheRead; cacheCreation };
  eventCount: number;
  subagents: Subagent[];
};
```

### Embed the scene in your own React app

The `web/components/Scene.tsx` is self-contained — drop it into any Next.js
or React app, pass it your own `sessions` array, and it renders. The data
shape is the `Session[]` type above.

## Configuration

| Env var      | Default | Purpose                              |
|--------------|---------|--------------------------------------|
| `CC3D_PORT`  | 3435    | WebSocket + HTTP server port         |

Web UI port is hard-coded at 3434 (Next.js). Edit `bin/cc-3d.mjs` to change.

## Hosting

This is **strictly local**. Your `.jsonl` files live on your machine; a
cloud-hosted version (Vercel, etc.) would have nothing to read. Don't try
to deploy this — it would just show an empty scene.

## Limitations

- **Antigravity** sessions don't write to `~/.claude/projects/` — they have
  their own pipeline and are not visible.
- Token cost is not calculated, only raw counts.
- In-memory state — restart the server, it re-reads everything from JSONL.
- Tested on Windows 10/11 + Node 20/22/24. Should also work on macOS/Linux
  where `~/.claude/projects/` exists, but not formally tested.

## Troubleshooting

- **WebSocket disconnected:** the server crashed or never started. `Ctrl+C`
  and `cc-3d` again.
- **Empty scene with "No active or idle sessions":** confirm sessions exist
  in `~/.claude/projects/` and that at least one had activity in the last
  2 minutes.
- **Notifications BLOCKED:** browser blocked them. Site permissions →
  localhost:3434 → allow notifications.
- **First run hangs at "installing web dependencies":** be patient, ~50
  packages install. Check `web/node_modules/` exists after.

## Contributing

PRs welcome. Areas that would be cool:

- [ ] Project clusters: agents from the same project group together
- [ ] Token-cost calculation per session
- [ ] Multi-model rooms (Opus / Sonnet / Haiku as separate areas)
- [ ] Recordings / replay of a session as 3D animation
- [ ] Multiplayer mode: see other peoples' agents (with explicit opt-in)

## License

MIT — see [LICENSE](./LICENSE).

## Credits

- Built on top of [Three.js](https://threejs.org/) + [react-three-fiber](https://docs.pmnd.rs/react-three-fiber) + [drei](https://github.com/pmndrs/drei)
- File watching via [chokidar](https://github.com/paulmillr/chokidar)
- The voxel/Minecraft aesthetic is procedurally generated, no external assets

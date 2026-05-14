# External Agents — connecting your own bots to cc-3d

cc-3d shows Claude Code sessions out of the box. But you can also push **any
external agent** (n8n bots, Marketing AI, Code Reviewers, Data Pipelines,
support chatbots…) and it will appear as a 3D voxel character right next to
your Claude sessions, with its own kind-based hat color, room, and bubble.

This is just two HTTP endpoints + a tiny JSON schema. No SDK needed.

## Endpoints

The cc-3d server exposes a small REST API on the same port as the WebSocket
(default `127.0.0.1:3435`).

### POST `/external/upsert` — register or update an agent

Call this once when the agent comes online, then again whenever its
`currentTask` changes. It is **idempotent** — calling it again with the same
`agentId` updates the existing agent.

**Request body:**
```json
{
  "agentId": "marketing-bot-1",          // required, your unique ID
  "kind": "marketing",                    // drives hat color + label
  "projectName": "Q4 Campaign",           // displayed below + clusters
  "label": "Pia (Marketing)",             // big nameplate over head
  "model": "gpt-4o-mini",                 // optional, free-text
  "currentTask": "Drafting newsletter",   // shown when selected
  "meta": {
    "branch": "campaign-q4",              // optional extras
    "owner": "@pia"
  }
}
```

**Recognized kinds (drive hat color):**

| `kind`     | Hat color | Hat shape |
|------------|-----------|-----------|
| `marketing`| pink      | cap       |
| `code`/`dev`| blue     | cap       |
| `review`/`audit` | green | bandana |
| `data`/`analyt`  | purple| cap     |
| `design`   | yellow    | bandana   |
| `support`  | cyan      | cap       |
| (any other)| gray      | cap       |

You can use any string for `kind` — the visual just falls back to gray cap.

### POST `/external/event` — push an activity event

Call this every time the agent does something (a tool call, a step in a
workflow, a message). This is what makes the character pulse, opens a speech
bubble over its head, and keeps it in the **active** room.

**Request body:**
```json
{
  "agentId": "marketing-bot-1",
  "eventType": "tool_use",
  "toolCall": { "name": "Mailgun", "description": "Send draft to QA list" },
  "task": "Drafting newsletter",       // optional — updates currentTask
  "tokens": { "input": 230, "output": 110 },  // optional — accumulates
  "summary": {                         // optional — drives the speech bubble
    "kind": "tool_use",
    "name": "Mailgun",
    "description": "Send draft to QA list"
  }
}
```

If you omit `summary`, cc-3d will derive one from `toolCall` or `task`.

### DELETE `/external/:agentId` — remove an agent

Call this when the agent shuts down for good. Otherwise it'll just go idle
after 15s and disappear after 3min on its own.

### GET endpoints

- `GET /` — list all endpoints
- `GET /health` — sanity check
- `GET /external` — list all currently-registered external agents
- `GET /snapshot` — full session snapshot (Claude + external) as JSON

## Status thresholds

cc-3d uses the same status logic for everyone:

- `< 15 s since last event` → **active** (in the orange Workshop room)
- `15 s – 3 min` → **idle** (in the blue Office room)
- `> 3 min` → **done** (hidden)

So just keep posting to `/external/event` while your bot is actually working.

## Example: Node.js external agent

```js
// my-marketing-bot.js
const BASE = 'http://127.0.0.1:3435';
const AGENT_ID = 'marketing-bot-1';

async function upsert(extra = {}) {
  await fetch(`${BASE}/external/upsert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agentId: AGENT_ID,
      kind: 'marketing',
      projectName: 'Q4 Campaign',
      label: 'Pia (Marketing)',
      ...extra,
    }),
  });
}

async function event(payload) {
  await fetch(`${BASE}/external/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId: AGENT_ID, ...payload }),
  });
}

// On startup
await upsert({ currentTask: 'Idle' });

// While doing real work
await upsert({ currentTask: 'Drafting newsletter' });
await event({
  eventType: 'tool_use',
  toolCall: { name: 'Mailgun', description: 'Send to QA list' },
  tokens: { input: 230, output: 110 },
});

// Heartbeat to stay "active" (call every ~10s while working)
setInterval(() => event({ eventType: 'heartbeat' }), 10_000);
```

## Example: Python external agent

```python
import requests, time, threading

BASE = 'http://127.0.0.1:3435'
AGENT_ID = 'review-bot-1'

def upsert(**extra):
    requests.post(f'{BASE}/external/upsert', json={
        'agentId': AGENT_ID,
        'kind': 'review',
        'projectName': 'PR Reviews',
        'label': 'Code Reviewer',
        **extra,
    })

def event(**payload):
    requests.post(f'{BASE}/external/event', json={'agentId': AGENT_ID, **payload})

upsert(currentTask='Watching PR queue')

def heartbeat():
    while True:
        event(eventType='heartbeat')
        time.sleep(10)

threading.Thread(target=heartbeat, daemon=True).start()

# When you actually review a PR
upsert(currentTask='Reviewing PR #482')
event(eventType='tool_use', toolCall={'name': 'GitHub', 'description': 'Fetch PR diff'})
```

## Example: n8n HTTP Request node

In your n8n workflow, drop an **HTTP Request** node:

- **Method:** POST
- **URL:** `http://localhost:3435/external/event`
- **Body type:** JSON
- **JSON:**
  ```json
  {
    "agentId": "n8n-{{$workflow.name}}",
    "eventType": "tool_use",
    "toolCall": {
      "name": "{{$node.name}}",
      "description": "{{$json.description || 'workflow step'}}"
    }
  }
  ```

Add a separate "Upsert on start" HTTP Request node at the beginning of your
workflow that POSTs to `/external/upsert` with `kind: "data"` (or whatever
fits) so the visuals are consistent.

## Bash one-liner

To quickly test that an external agent shows up:

```bash
curl -X POST http://127.0.0.1:3435/external/upsert \
  -H 'Content-Type: application/json' \
  -d '{"agentId":"test","kind":"marketing","projectName":"Test","label":"Test Bot","currentTask":"hello world"}'

# Then push an event:
curl -X POST http://127.0.0.1:3435/external/event \
  -H 'Content-Type: application/json' \
  -d '{"agentId":"test","eventType":"tool_use","toolCall":{"name":"Echo","description":"hi"}}'
```

You should see a pink-capped character in the orange Workshop room within 1s.

## How it appears in the UI

- Filed under its `projectName` (so all your Marketing bots cluster together)
- The big floor label below the cluster shows the project name
- The character's nameplate shows your `label` field
- The smaller line under the name shows the `kind` (e.g. `MARKETING`)
- When you click it, the side panel shows the event stream + currentTask
- Speech bubbles pop over the head whenever you POST `/external/event`

## Why this design

- **No client library** — just HTTP + JSON, works from anything
- **Idempotent upsert** — restart your bot, no duplicate
- **Auto-cleanup** — agents that stop posting events disappear automatically
- **Same data model as Claude sessions** — they share the room and the same
  WebSocket protocol

## Limits

- The server holds external agents **in memory** — restart the cc-3d server
  and they're all gone. Re-upsert on bot startup.
- Tokens accumulate forever (until server restart). Send `tokens: { input: 0, output: 0 }` in events that don't actually consume tokens.
- One server, one machine. No multi-host federation (yet).

## Wishlist for future

- Persistence: optional SQLite that survives restart
- Bots-with-bots: external agents can declare subagents too
- Agent-to-agent links: visualize which agents talk to which
- Webhook back-channel: cc-3d notifies your bot when a user clicks it

PRs welcome.

# NetCrawl

> A programmable idle game where you write **real JavaScript (or Python) workers** to automate a network graph.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-green)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-monorepo-orange)](https://pnpm.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-100%25-blue)](https://www.typescriptlang.org)

---

## What is this?

NetCrawl is a game about writing code that writes itself out of trouble.

You manage a computer network under constant threat of infection. To survive, you deploy **autonomous workers** — bots you program in real JavaScript or Python — that harvest resources, defend nodes, and fulfill API requests.

The twist: **the workers run as actual Node.js child processes**. Your code executes for real.

```js
// workspace/workers/Harvester.js
export class Harvester {
  async run(api) {
    while (true) {
      const nodes = await api.scan()
      const target = nodes.find(n => n.type === 'resource' && !n.depleted)
      await api.move(target.id)
      await api.harvest()
      await api.move('hub')
      await api.deposit()
    }
  }
}
```

Deploy it. Watch it move. Write a better one. Repeat.

---

## Features

- 🤖 **Write real workers** in JavaScript or Python — no sandbox, actual subprocesses
- 🌐 **Live network graph** — interactive visualization powered by React Flow
- ⚔️ **Infection spreading system** — if the hub gets infected, it's game over
- 📈 **Deep progression** — 30 levels, 8-chapter quest book, 50+ achievements
- 🔧 **Chip & upgrade system** — equip passive effects onto nodes and workers
- 🔁 **Git-based versioning** — roll back to any worker revision you've committed
- 🐍 **Python SDK** — write workers in Python with the same API
- 🌍 **i18n support** — UI available in multiple languages

---

## Quick Start

### Via CLI (recommended)

```bash
npm install -g netcrawl
netcrawl init     # set up your worker workspace
netcrawl start    # launch the game, opens browser automatically
```

### From source

```bash
git clone https://github.com/RIDCorix/netcrawl2
cd netcrawl2
pnpm install
pnpm --filter server dev    # API server on port 4800
pnpm --filter ui dev        # UI on port 5173
```

Open http://localhost:5173

---

## Writing Workers

Workers live in `workspace/workers/`. Any `.js` or `.py` file with an exported class is discoverable.

```js
export class Guardian {
  async run(api) {
    while (true) {
      const nodes = await api.scan()
      const infected = nodes.find(n => n.infected)
      if (infected) {
        await api.move(infected.id)
        await api.repair(infected.id)
      } else {
        await api.sleep(2000)
      }
    }
  }
}
```

Commit your changes, then deploy any revision from the UI.

```bash
git -C workspace commit -am "smarter guardian"
# now selectable in the Deploy dialog
```

### Worker API

| Method | Description |
|--------|-------------|
| `api.move(nodeId)` | Move to adjacent node |
| `api.harvest()` | Collect resources at current node |
| `api.deposit()` | Deposit resources at Hub |
| `api.scan()` | Get nearby node info |
| `api.repair(nodeId)` | Repair an infected node |
| `api.findPath(from, to)` | BFS pathfinding |
| `api.log(msg)` | Log visible in UI |
| `api.getResources()` | Get current carried resources |

### Python workers

```python
from netcrawl import WorkerBase

class PyHarvester(WorkerBase):
    async def run(self, api):
        while True:
            await api.move("r1")
            await api.harvest()
            await api.move("hub")
            await api.deposit()
```

---

## Game Mechanics

| Element | Description |
|---------|-------------|
| **Hub** | Central node. Game over if infected. |
| **Resource Nodes** | Harvest Data, RP, or Credits. Deplete over time. |
| **Relay Nodes** | Extend your network reach. |
| **Infected Nodes** | Spread 10% per tick. Repair or contain them. |
| **Locked Nodes** | Unlock by spending resources. |
| **Chips** | Passive upgrades equipped on nodes/workers. Drop from loot. |
| **API Nodes** | Fulfill incoming requests for Credits. |

---

## Architecture

```
netcrawl2/
├── packages/
│   ├── cli/          ← netcrawl CLI (init / start / reset)
│   ├── server/       ← Express + WebSocket + game loop + worker spawner
│   ├── daemon/       ← Worker subprocess runtime
│   ├── ui/           ← React + Vite + React Flow frontend
│   └── sdk-python/   ← Python SDK for writing workers in Python
└── workspace/        ← Your workers live here (git-tracked)
```

The server runs a **1 Hz game tick** for infection spread and node recovery. Workers run as separate child processes, communicating back via HTTP.

---

## CLI

```bash
netcrawl init    # Initialize workspace with example Harvester + Guardian workers
netcrawl start   # Start server + UI, open browser at localhost:5173
netcrawl reset   # Reset game state to initial
```

---

## Development

```bash
pnpm install              # Install all packages
pnpm --filter server dev  # Server in watch mode (port 4800)
pnpm --filter ui dev      # UI dev server (port 5173)
pnpm -r build             # Build all packages
```

---

## Roadmap

- [ ] Launcher chips (workers that spawn child workers)
- [ ] Multiplayer (shared network, competing workers)
- [ ] Worker marketplace (share/import community workers)
- [ ] Visual worker builder (no-code drag-and-drop)
- [ ] Cache nodes, pub/sub events, circuit breaker mechanics

---

## Contributing

PRs welcome. The game is designed to be extended — new node types, worker actions, quest chapters, and chip effects are all modular.

1. Fork the repo
2. Create a feature branch
3. Open a PR with a description of what you added

---

## License

MIT — see [LICENSE](LICENSE)

---

*Built with TypeScript, React, React Flow, Express, and real subprocess workers.*

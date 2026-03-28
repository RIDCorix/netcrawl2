# NetCrawl

A programmable idle game where you write real JavaScript workers to explore a network graph.

## Quick Start

```bash
git clone https://github.com/RIDCorix/netcrawl2
cd netcrawl2
pnpm install
pnpm --filter server dev    # Start API server (port 3001)
pnpm --filter ui dev        # Start UI (port 5173)
```

Open http://localhost:5173

## Architecture

```
netcrawl2/
├── packages/
│   ├── cli/        ← netcrawl CLI command
│   ├── server/     ← Express API + SQLite + WebSocket
│   ├── daemon/     ← Worker subprocess utilities
│   └── ui/         ← Vite + React frontend (React Flow graph)
```

## Writing Workers

Workers live in `workspace/workers/`. Write a class with a `run(api)` method:

```js
export class MyWorker {
  async run(api) {
    while (true) {
      await api.move('r1')
      await api.harvest()
      await api.move('hub')
      await api.deposit()
    }
  }
}
```

## Worker API

| Method | Description |
|--------|-------------|
| `api.move(nodeId)` | Move to adjacent node (sleeps for travel time) |
| `api.harvest()` | Collect resources at current resource node |
| `api.deposit()` | Deposit carried resources at Hub |
| `api.scan()` | Get nearby node info |
| `api.repair(nodeId)` | Repair infected node (costs 30 energy) |
| `api.findPath(from, to)` | Get path array (BFS) |
| `api.log(msg)` | Log a message (visible in UI) |
| `api.getResources()` | Get currently carried resources |

## Deploying Workers

1. Write your worker class in `workspace/workers/`
2. Commit: `git commit -am "add my worker"`
3. In the UI, click a node → Deploy section → pick revision + class → Deploy

## Game Mechanics

- **Hub**: Central node. Workers deposit resources here.
- **Resource Nodes**: Harvest Energy, Ore, or Data.
- **Relay Nodes**: Extend network reach to new areas.
- **Infected Nodes**: Spread infection to neighboring unlocked nodes. If the Hub gets infected, game over!
- **Locked Nodes**: Unlock by spending resources.

## CLI

```bash
netcrawl init    # Initialize workspace with example workers
netcrawl start   # Start server + UI, open browser
netcrawl reset   # Reset game state to initial
```

## Development

```bash
pnpm install              # Install all dependencies
pnpm --filter server dev  # Start server in watch mode
pnpm --filter ui dev      # Start UI dev server
pnpm -r build             # Build all packages
```

## Server API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/state` | GET | Full game state + workers |
| `/api/gather` | POST | Manual gather +10 resources |
| `/api/unlock` | POST | Unlock a node (pay cost) |
| `/api/deploy` | POST | Deploy a worker subprocess |
| `/api/recall` | POST | Kill a worker process |
| `/api/revisions` | GET | Git log of workspace |
| `/api/classes` | GET | Discover worker classes |
| `/api/worker/action` | POST | Worker action endpoint |
| `/api/reset` | POST | Reset game state |

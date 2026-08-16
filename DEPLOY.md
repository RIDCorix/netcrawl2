# Cloud Deployment: Vercel (UI) + Railway (Server)

## Architecture

```
Browser → Vercel (static UI) → Railway (Express server + WebSocket)
                                  ├── /api/* (REST, with JWT auth)
                                  ├── /ws (WebSocket, with token query param)
                                  └── data/users/{userId}/state.json (per-user)
```

## 1. Deploy Server to Railway

```bash
cd packages/server

# Build TypeScript
pnpm build

# Create Railway project
railway init

# Set environment variables
railway variables set NETCRAWL_MULTI_USER=true
railway variables set JWT_SECRET=$(openssl rand -hex 32)
railway variables set NETCRAWL_DATA_DIR=/app/data
railway variables set NETCRAWL_CI_WATCHDOG=true
railway variables set PORT=4800

# Deploy
railway up
```

Note the Railway URL (e.g. `https://netcrawl-server-production.up.railway.app`)

## 2. Deploy UI to Vercel

```bash
cd packages/ui

# Set the Railway server URL as environment variable
# Replace with your actual Railway URL
vercel env add VITE_API_URL production
# Enter: https://netcrawl-server-production.up.railway.app

# Deploy
vercel --prod
```

## 3. Update Railway CORS

After getting the Vercel URL, update Railway:

```bash
cd packages/server
railway variables set ALLOWED_ORIGINS=https://your-app.vercel.app
railway up
```

## Environment Variables

### Railway (Server)
| Variable | Value | Required |
|----------|-------|----------|
| `NETCRAWL_MULTI_USER` | `true` | Yes |
| `JWT_SECRET` | Random 32+ char string | Yes |
| `NETCRAWL_DATA_DIR` | `/app/data` | Yes |
| `PORT` | `4800` | No (Railway auto-assigns) |
| `ALLOWED_ORIGINS` | Your Vercel URL | Recommended |
| `NETCRAWL_CI_WATCHDOG` | `true` | Yes |

### Vercel (UI)
| Variable | Value | Required |
|----------|-------|----------|
| `VITE_API_URL` | Your Railway URL | Yes |

## Local Development (unchanged)

```bash
# No auth, single user, relative URLs via Vite proxy
pnpm dev
```

When `VITE_API_URL` is not set, the UI uses relative URLs (Vite proxy) and skips the login page.

## External CI Watchdog

The Railway server checks the public `RIDCorix/netcrawl2` repository immediately
after startup and every five minutes. `GET /health/ci-watchdog` returns 200 only
when `test.yml` is active and the current `master` commit has a recent completed,
successful Test Suite push run. Pending, failed, disabled, stale, malformed, and
unreachable GitHub states return 503. Responses are never cached.

After deploying with `NETCRAWL_CI_WATCHDOG=true`, Corix must create one standard
HTTP(S) monitor in UptimeRobot's free plan:

1. Point it at the Railway service URL plus `/health/ci-watchdog`.
2. Use a five-minute monitoring interval.
3. Attach Corix's verified email and mobile-push alert contacts.
4. Keep the monitor active. During planned maintenance, pause it explicitly and
   restore it immediately afterward.

UptimeRobot's repeated request is also the liveness signal for the Railway
watchdog itself: if the server, its polling loop, or GitHub verification stops,
the endpoint becomes unavailable or stale and UptimeRobot alerts outside the
GitHub Actions control plane. Do not place alert credentials in this repository,
Railway logs, or issue comments.

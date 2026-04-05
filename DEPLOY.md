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

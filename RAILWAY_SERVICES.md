# Railway Services Setup

Repo ini idealnya dijalankan sebagai 2 service terpisah:

## 1) Lavalink service (Java)
- Dockerfile Path: `Dockerfile`
- Output: endpoint Lavalink (WebSocket) untuk musik
- Variables (contoh):
  - `LAVALINK_SERVER_PASSWORD=...`
  - `YOUTUBE_API_KEY=...` (opsional)

## 2) Bot + API service (Node)
- Dockerfile Path: `Dockerfile.bot`
- Output:
  - Bot Discord (online di Discord)
  - API HTTP (Railway akan expose port dari env `PORT`)
- Variables minimal:
  - `DISCORD_TOKEN=...`
  - `DISCORD_CLIENT_ID=...`
  - `GUILD_ID=...`
  - `PUBLIC_FRONTEND_URL=...` (URL Vercel)
  - `API_BASE_URL=...` (URL Railway bot+api)
  - `MONGO_URI=...`
  - `PORT=3001` (Railway biasanya set otomatis)
  - Lavalink connect:
    - `LAVALINK_HOST=<domain service lavalink tanpa https>`
    - `LAVALINK_PORT=443`
    - `LAVALINK_SECURE=true`
    - `LAVALINK_PASSWORD=<password yang sama dengan lavalink>`
    - `LAVALINK_PATH=/`

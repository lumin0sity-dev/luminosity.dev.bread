# luminosity.dev.bread
:D
```markdown
# EaglercraftX-like Reimplementation (multiplayer-capable)

This repository is an original reimplementation of a browser-based Minecraft 1.12.2-style client with multiplayer support and server code. It is intentionally built without copyrighted assets.

Features
- Single-page web client (first-person pointer-lock, hotbar, day/night)
- Solid-player collision (AABB), stepping over blocks
- Chunked InstancedMesh rendering for high performance
- Local save/load (localStorage) and export/import
- Multiplayer via WebSocket:
  - Player position sync
  - Block-change broadcast via authoritative server
  - Chat
- Simple Node.js WebSocket server included (server/index.js)
- Licensed MIT — see LICENSE

Quickstart (local, single-player + server)
1. Install Node.js (v18+ recommended).
2. Clone/create repo and commit files from this project.
3. From the repo root:
   - Start server: `cd server && npm install && node index.js`
   - Serve static client files (one of):
     - Open client locally with a simple static server:
       - `python -m http.server 8000` (then open http://localhost:8000)
     - Or run a dev server (e.g., `npx serve .`), or push to GitHub Pages for static hosting.
4. To test multiplayer locally:
   - Run server on port 3000 (default)
   - Open two browser windows to the client (http://localhost:8000) and use the "Connect" button in the UI to point to ws://localhost:3000 (room id may be left default).
5. Export/Import world using the UI (top-right).

Deployment notes
- Client can be hosted as static files (GitHub Pages, Netlify, Vercel).
- Server can be deployed to any Node-supporting host (Render, Fly, Railway, Heroku, a VPS, etc). Make sure to open the WebSocket port and set environment variables if needed.

Security, moderation, and scale
- This server is intentionally small and educational. For production multiplayer you’ll want:
  - authentication and authorization,
  - rate limiting and message validation,
  - authoritative movement collision on server for anti-cheat,
  - chunk streaming, persistence and snapshots,
  - TLS and domain configuration.
- The server will persist worlds to JSON files in `server/worlds/` by default for durability.

Files in this repo
- LICENSE
- README.md
- index.html
- style.css
- src/main.js (client)
- src/chunk.js (client chunk/instancing helper)
- server/index.js (node ws server)
- server/package.json
- .gitignore


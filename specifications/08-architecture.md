# 08 — Technical architecture

## Stack

| Part | Choice | Rationale |
|---|---|---|
| Language | TypeScript, shared code between client and server | Same physics/constants on both sides |
| Client | HTML5 Canvas 2D, no framework, bundled with Vite | Light, fast, no install |
| Server | Node.js (LTS) single process, `ws` WebSocket library | Simple, one game per process |
| Tests | Vitest for the shared simulation | Deterministic, headless |

The server serves the static client files **and** the WebSocket endpoint on the same port, so a player only needs one URL.

## Networking model

- **Server-authoritative** simulation: clients send only their inputs (pressed keys + sequence number); the server computes positions, hits, scores. Prevents cheating and keeps all players consistent.
- Server tick: **30 Hz**. State snapshots broadcast at **20 Hz**.
- Client renders at the display refresh rate (target 60 fps) and **interpolates** other frigates and projectiles between snapshots (≈ 100 ms buffer).
- Own frigate: **client-side prediction** with server reconciliation, so controls feel instant even with latency.
- Snapshots contain only dynamic state (frigates, projectiles, scores). The world is sent once on join and on regeneration.
- Messages: JSON for v1; binary encoding only if bandwidth requires it.
- Target playable latency: up to 150 ms round-trip.

## Deployment

- Run with a single command (e.g. `npm start`, or a Docker image), configurable port.
- **Phase 1 — local network**: the server runs on a machine of the LAN; players open `http://<server-ip>:<port>`. Plain HTTP/WS is acceptable. The README MUST document how to start it and find the URL.
- **Phase 2 — Google Cloud (GCP)**, later: same server packaged as a Docker image, exposed over HTTPS/WSS. The architecture MUST NOT preclude this (e.g. configurable port, a single container, no local-file dependencies). The exact GCP service is chosen in phase 2.
- No database; all state is in memory and lost when the server restarts.

## Performance targets

- Client: 60 fps on a mid-range laptop in a recent Chrome, Firefox, Safari or Edge.
- Server: 4 players + up to ~100 projectiles at 30 Hz with negligible CPU.
- Bandwidth: < 50 kB/s per client.

## Quality

- Gameplay constants in one shared config file.
- Unit tests for movement, collisions, world connectivity, hit detection, scoring, host transfer.
- A debug overlay (toggle) showing FPS, ping, tick, collision shapes.

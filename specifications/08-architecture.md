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
- Client renders at the display refresh rate (target 60 fps) and **interpolates** other frigates between snapshots (≈ 100 ms buffer).
- Own frigate: **client-side prediction** with server reconciliation, so controls feel instant even with latency.
- Snapshots carry frigates (including each frigate's required commanded `throttle`), scores, and the four team bonus-pool integers. Every frigate is included for every client; team contacts can bypass the client radar sweep. The own-boat prediction updates throttle immediately from local W/S input. Each shell and torpedo is sent once on spawn; the server sends torpedo removals when they hit, touch land, or leave the world. A full projectile reset is sent after join and world regeneration. Clients advance projectiles along their known paths using the same delayed server clock as frigate interpolation (Q49, Q210–Q211, Q218–Q220).
- Clients send `{ type: "upgrade", track }` purchases. Snapshots carry public treasure positions and player money, round earnings, and upgrade levels only when that economy payload changes, using a per-session cache; economy data is not repeated every snapshot. Non-own max HP is derived from the public hull upgrade level (Q238, Q244, Q246).
- The `welcome` message includes the current game settings; a `settings` message broadcasts host updates to joined clients.
- `welcome` includes the current `RoundState`; `{ type: "round"; round: RoundState }` broadcasts phase and timer changes. Round times use the same server clock as snapshot `serverTime`; results are computed at round end and are not part of snapshots.
- Team selection is an optional join field; `{ type: "team"; team }` requests a switch. Team ownership is represented by team indices while berth slots remain capacity identities. Round results include team membership, team scores, and winning teams (Q203–Q215).
- Game events include `damage` notifications when a frigate loses HP or a shell damages a turret. They identify the target position, amount, cause, and source where applicable; these events carry no feed message. Clients use them for shooter-only hit feedback and own-damage effects.
- Each base's held-income timer is server-only and is never included in snapshots or base status. Income is broadcast as a change-only game event when a non-home base pays out; base-status JSON remains change-only and cached per session (Q180).
- Sound synthesis and hit/effects settings are client-only. They do not add assets or network messages; settings persist in localStorage.
- Messages: JSON for v1; binary encoding only if bandwidth requires it.
- Target playable latency: up to 150 ms round-trip.

## Deployment

- Run with a single command (e.g. `npm start`, or a Docker image), configurable port.
- **Phase 1 — local network**: the server runs on a machine of the LAN; players open `http://<server-ip>:<port>`. Plain HTTP/WS is acceptable. The README MUST document how to start it and find the URL.
- **Phase 2 — Google Cloud (GCP)**, later: same server packaged as a Docker image, exposed over HTTPS/WSS. The architecture MUST NOT preclude this (e.g. configurable port, a single container, no local-file dependencies). The exact GCP service is chosen in phase 2.
- No database; all state, including host-adjustable game settings, is in memory and lost when the server restarts.

## Performance targets

- Client: 60 fps on a mid-range laptop in a recent Chrome, Firefox, Safari or Edge.
- Server: 4 players + up to ~100 projectiles at 30 Hz with negligible CPU.
- Bandwidth: < 50 kB/s per client.

## Versioning

- Release versions MUST follow semantic versioning independently of the specification version; the first public release is `v1.0.0`.
- Each release MUST use an annotated `vX.Y.Z` git tag on `main`; the lobby and server startup log MUST show the version from `package.json`.
- Before tagging, maintainers MUST bump `package.json` and add a `CHANGELOG.md` entry; use patch for fixes, minor for new features, and major for breaking changes such as incompatible clients.

## Quality

- Gameplay constants in one shared config file.
- Unit tests for movement, collisions, world connectivity, hit detection, scoring, host transfer.
- A debug overlay (toggle) showing FPS, ping, tick, collision shapes.

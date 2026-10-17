# Warships

A persistent, four-captain naval free-for-all. The first player to join is the host.

**Specification status: APPROVED v1.15.**

## Play on your LAN

Install Node.js 24 on the server computer, then from this repository run:

```sh
npm ci
npm run build
npm start
```

Share `http://<server-computer-LAN-IP>:8080` with players on the same network. The server prints its LAN URL at startup. Keep the process running while you play.

## Controls

| Action | Key (`KeyboardEvent.code`) |
| --- | --- |
| Throttle up / down one level | `KeyW` / `KeyS` |
| Turn hull | `KeyA` / `KeyD` |
| Aim cannon | `ArrowLeft` / `ArrowRight` |
| Cannon range | `ArrowUp` / `ArrowDown` |
| Fire cannon salvo | `ShiftRight` |
| Aim torpedoes | `BracketLeft` / `BracketRight` |
| Fire torpedoes | `Backslash` or `IntlBackslash` |
| Full scoreboard (hold) | `Tab` |
| Host menu | `Escape` |
| Debug overlay | `F3` |

## Development

```sh
npm ci
npm run dev
```

Vite serves the client at `http://localhost:5173` and proxies WebSockets to the game server on port 8080. To change the game server port, set `PORT`; configure the Vite proxy accordingly when developing with a non-default port.

## Quality checks

```sh
npm run typecheck
npm test
npm run build
```

## Changelog

- **v1.15** — Natural terrain rendering with rounded 60 u shallows, surf, beaches, grass, forest, and rock (Q72–Q76).

## Docker

```sh
docker build -t warships .
docker run --rm -p 8080:8080 -e PORT=8080 warships
```

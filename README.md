# Warships

A persistent, four-captain naval free-for-all. The first player to join is the host.

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
| Fire cannon salvo | `Space` |
| Aim torpedoes | `BracketLeft` / `Backslash` or `IntlBackslash` |
| Fire torpedoes | `BracketRight` |
| Full scoreboard (hold) | `Tab` |
| Menu (Controls for everyone; host actions for the host) | `Escape` |
| Debug overlay | `F3` |

## Releases

Release notes are in [CHANGELOG.md](CHANGELOG.md). Versions are tagged `vX.Y.Z`; the running version is shown in the lobby and in the server log.

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

## Docker

```sh
docker build -t warships .
docker run --rm -p 8080:8080 -e PORT=8080 warships
```

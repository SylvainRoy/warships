# Changelog

All notable changes to Warships are recorded here. Versions follow semantic versioning: patch for fixes, minor for new features, major for breaking changes.

## [1.0.0] — 2026-10-18

First public release of Warships, a browser-based naval free-for-all for up to four captains. It implements specification v1.18.

### Gameplay
- Server-authoritative frigates with a throttle telegraph (astern, stop, 1/3, 2/3, full), hull steering and soft land collisions.
- Cannon salvos with an adjustable bearing and range (100–800 u) and a 60 u blast radius.
- Three-torpedo spreads with an aimable bearing and an arming delay.
- Sinking, scoring, respawning with 3 s spawn protection, and a scoreboard (hold Tab).

### World and display
- A generated 16,000 × 9,000 u archipelago with connected water and channels at least 160 u wide.
- Natural terrain: turquoise shallows, surf, beaches, grass, forest and rock.
- A camera centred on your boat inside a fixed 16:9 frame, so every player sees the same 1600 × 900 u area.
- Frigate wakes, torpedo bubble trails, cannon and torpedo aim arrows, and a 3,000 u radar that shows other boats only as directions.

### Players and host
- The first player to join is the host, who can regenerate the world, reset scores, kick players and adjust game settings (speeds, reload times, aim rotation, land coverage).
- Every player can remap the 12 game controls in Esc → Controls. Bindings are saved in each browser.

### Running it
- On your LAN: `npm ci && npm run build && npm start`, then open `http://<server-ip>:8080`.
- With Docker: build and run the provided `Dockerfile`; the server listens on port 8080.

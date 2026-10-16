# 05 — Controls & HUD

## Key bindings

Keys are bound by **physical position** (`KeyboardEvent.code`), not by printed character, so the layout works on QWERTY and AZERTY keyboards alike (e.g. on a French AZERTY keyboard, "W A S D" are the keys printed Z Q S D; on a French PC keyboard `[ ] \` are the keys printed `^ $ *`).

The game MUST work on both **Mac and PC** keyboards (Windows/Linux). Implementation notes:
- On Mac and PC ISO keyboards the key left of Enter reports `Backslash`; on some layouts the key left of Z reports `IntlBackslash`. Both MUST be accepted as "fire torpedoes".
- Right Shift MUST be distinguished from Left Shift (`ShiftRight`), which browsers support on both platforms.
- The bindings MUST be verified on at least: Mac French AZERTY, PC French AZERTY, PC US QWERTY.

| Action | Code | QWERTY key |
|---|---|---|
| Accelerate forward | `KeyW` | W |
| Accelerate backward / brake | `KeyS` | S |
| Rotate hull left | `KeyA` | A |
| Rotate hull right | `KeyD` | D |
| Cannon bearing left | `ArrowLeft` | ← |
| Cannon bearing right | `ArrowRight` | → |
| Cannon range + | `ArrowUp` | ↑ |
| Cannon range − | `ArrowDown` | ↓ |
| Fire cannons | `ShiftRight` | Right Shift |
| Torpedo bearing left | `BracketLeft` | [ |
| Torpedo bearing right | `BracketRight` | ] |
| Fire torpedoes | `Backslash` (or `IntlBackslash`) | \ |
| Show full scoreboard (hold) | `Tab` | Tab (proposed) |
| Host menu | `Escape` | Esc (proposed) |

- Holding a fire key does not auto-fire: one press = one salvo (proposed).
- Default browser behaviour of these keys (scrolling, focus change) MUST be suppressed while the game has focus.
- Key remapping: out of scope for v1 (proposed).

## In-world indicators

- **Cannon target**: a green "modern" reticle (circle with four ticks and a centre dot) drawn on the map at the aim point, rendered above terrain. Its radius equals the damage radius (60 u), so the player sees the impact zone. While reloading it is dimmed and shows the reload progress as a circular arc (proposed).
- **Torpedo arrow**: a green arrow drawn on a circle of radius ≈ 50 u around the frigate, pointing to the torpedo bearing. Dimmed with progress indicator while reloading (proposed).
- Indicators are visible **only to their owner** (proposed, Q17).

## HUD (screen space)

- Top-right: compact scoreboard (name, colour, score) for all connected players, own line highlighted.
- Bottom-left: own HP bar, cannon and torpedo reload status.
- Bottom-right: minimap ([02-world.md](02-world.md#camera)).
- Event feed (top-left): short messages "Alice sank Bob", "Carol joined", "World regenerated", fading after 5 s.
- Death screen: "Sunk by *X*" + respawn countdown.

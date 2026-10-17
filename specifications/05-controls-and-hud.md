# 05 — Controls & HUD

## Key bindings

Keys are bound by **physical position** (`KeyboardEvent.code`), not by printed character, so the layout works on QWERTY and AZERTY keyboards alike (e.g. on a French AZERTY keyboard, "W A S D" are the keys printed Z Q S D; on a French PC keyboard `[ ] \` are the keys printed `^ $ *`).

The game MUST work on both **Mac and PC** keyboards (Windows/Linux). Implementation notes:
- On Mac and PC ISO keyboards the key left of Enter reports `Backslash`; on some layouts the key left of Z reports `IntlBackslash`. Both MUST be accepted as "fire torpedoes".
- Right Shift MUST be distinguished from Left Shift (`ShiftRight`), which browsers support on both platforms.
- The bindings MUST be verified on at least: Mac French AZERTY, PC French AZERTY, PC US QWERTY.

| Action | Code | QWERTY key |
|---|---|---|
| Increase throttle one level | `KeyW` | W |
| Decrease throttle one level | `KeyS` | S |
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
| Show full scoreboard (hold) | `Tab` | Tab |
| Host menu | `Escape` | Esc |

- Holding a fire key does not auto-fire: one press = one salvo.
- Each non-repeating W press increases throttle by one level; each non-repeating S press decreases it. The five levels are full astern, stop, one-third ahead, two-thirds ahead, and full ahead.
- Default browser behaviour of these keys (scrolling, focus change) MUST be suppressed while the game has focus.
- Key remapping: out of scope for v1.

## Host menu

The host opens the menu with Esc. R requests world regeneration, X requests a score reset, K opens a numbered list of captains to kick, and S opens Settings. Select a kick target with `Digit1`–`Digit3` or `Numpad1`–`Numpad3`. Enter or NumpadEnter confirms a pending action; Esc cancels it or returns from kick selection. Confirmations are shown in-game, not in browser dialogs.

In Settings, the rows are Boat speed, Rotation speed, Cannon rotation, Torpedo rotation, Shell speed, Torpedo speed, Cannon reload, Torpedo reload, and Land coverage. Up/Down selects a row, Left/Right changes its value, D restores defaults, Enter applies the draft, and Esc returns to the host menu. When Land coverage differs from the applied value, the hint says `Enter: apply + new map`; applying it immediately generates a new map while keeping scores.

## In-world indicators

- **Cannon target**: a green "modern" reticle (circle with four ticks and a centre dot) drawn on the map at the aim point, rendered above terrain. Its radius is 30 u, half the 60 u blast radius, so it marks the aim point rather than the full damage zone. The ticks span 25–27.5 u and the centre dot has a 1.25 u radius. The ticks are oriented along the line of fire from the frigate to the aim point. While reloading, a 2 u line-width arc at 33.5 u radius shows reload progress starting at that bearing.
- **Cannon bearing arrow**: a filled triangle in the sight colour, from 60 u to 70 u from the frigate centre with a 4 u half-width, points along the cannon bearing and dims while reloading.
- **Torpedo arrow**: a green, segmented radar-style arrow along the torpedo bearing: five equal shaft dashes from 19 u to 48 u radius, separated by 1.5 u gaps; an open chevron from a 56 u tip to points at 49 u radius and ±4.5 u perpendicular; and a 6 u base tick at 19 u. Its dash and chevron line width is 1.25 u and the base tick line width is 1 u. While reloading, completed dashes fill in, remaining dashes and the chevron dim, and the base tick dims; there is no reload arc.
- **Frigate HP bars**: the small bar below a frigate is shown for enemies only; own hull integrity remains in the bottom-left HUD.
- Indicators are visible **only to their owner**.

## HUD (screen space)

- HUD panels and overlays use the reference screen's fit (contain) scale and are anchored to the browser window edges (Q41, Q56); positions and sizing remain in reference units.
- Top-right: compact scoreboard (name, colour, score) for all connected players, own line highlighted.
- Holding Tab shows the full scoreboard; when settings differ from defaults, it adds a `CUSTOM RULES · …` line listing each changed setting.
- Bottom-left: own HP bar, cannon and torpedo reload status, plus a throttle telegraph with the selected level highlighted and its full label.
- Event feed (top-left): short messages "Alice sank Bob", "Carol joined", "World regenerated", fading after 5 s.
- Death screen: "Sunk by *X*" + respawn countdown.

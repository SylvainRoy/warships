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

In Settings, the rows are Boat speed, Rotation speed, Cannon rotation, Torpedo rotation, Shell speed, Torpedo speed, Cannon reload, and Torpedo reload. Up/Down selects a row, Left/Right changes its value, D restores defaults, Enter applies the draft, and Esc returns to the host menu. Settings apply immediately to the battle.

## In-world indicators

- **Cannon target**: a green "modern" reticle (circle with four ticks and a centre dot) drawn on the map at the aim point, rendered above terrain. Its radius equals the damage radius (60 u), so the player sees the impact zone. The ticks are oriented along the line of fire from the frigate to the aim point. While reloading it is dimmed and shows the reload progress as a circular arc starting at that bearing.
- **Cannon bearing arrow**: a filled triangle in the sight colour, from 120 u to 140 u from the frigate centre, points along the cannon bearing and dims while reloading.
- **Torpedo arrow**: a green, segmented radar-style arrow along the torpedo bearing: five equal shaft dashes from 38 u to 96 u radius, separated by 3 u gaps; an open chevron from a 112 u tip to points at 98 u radius and ±9 u perpendicular; and a 12 u base tick at 38 u. While reloading, completed dashes fill in, remaining dashes and the chevron dim, and the base tick dims; there is no reload arc.
- **Frigate HP bars**: the small bar below a frigate is shown for enemies only; own hull integrity remains in the bottom-left HUD.
- Indicators are visible **only to their owner**.

## HUD (screen space)

- HUD panels and overlays are anchored to the browser window edges, not the 16:9 reference frame; positions and sizing remain in reference units and scale with the reference scale.
- Top-right: compact scoreboard (name, colour, score) for all connected players, own line highlighted.
- Holding Tab shows the full scoreboard; when settings differ from defaults, it adds a `CUSTOM RULES · …` line listing each changed setting.
- Bottom-left: own HP bar, cannon and torpedo reload status, plus a throttle telegraph with the selected level highlighted and its full label.
- Event feed (top-left): short messages "Alice sank Bob", "Carol joined", "World regenerated", fading after 5 s.
- Death screen: "Sunk by *X*" + respawn countdown.

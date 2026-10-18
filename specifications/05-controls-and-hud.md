# 05 — Controls & HUD

## Key bindings

Keys are bound by **physical position** (`KeyboardEvent.code`), not by printed character, so the layout works on QWERTY and AZERTY keyboards alike (e.g. on a French AZERTY keyboard, "W A S D" are the keys printed Z Q S D; on a French PC keyboard `[ ] \` are the keys printed `^ $ *`).

The game MUST work on both **Mac and PC** keyboards (Windows/Linux). Implementation notes:
- On Mac and PC ISO keyboards the key left of Enter reports `Backslash`; on some layouts the key left of Z reports `IntlBackslash`. Both MUST be accepted as "torpedo right".
- `ShiftLeft` and `ShiftRight` remain distinct assignable codes; the Controls menu displays them as Left Shift and Right Shift when bound.
- The bindings MUST be verified on at least: Mac French AZERTY, PC French AZERTY, PC US QWERTY.

| Action | Code | QWERTY key |
|---|---|---|
| Throttle up | `KeyW` | W |
| Throttle down | `KeyS` | S |
| Hull left | `KeyA` | A |
| Hull right | `KeyD` | D |
| Cannon left | `ArrowLeft` | ← |
| Cannon right | `ArrowRight` | → |
| Range + | `ArrowUp` | ↑ |
| Range − | `ArrowDown` | ↓ |
| Fire cannons | `Space` | Space |
| Torpedo left | `BracketLeft` | [ |
| Torpedo right | `Backslash` and `IntlBackslash` | \ and ISO \ |
| Fire torpedoes | `BracketRight` | ] |
| Show full scoreboard (hold) | `Tab` | Tab |
| Menu (all players) | `Escape` | Esc |
| Toggle debug | `F3` | F3 |

- Holding a fire key does not auto-fire: one press = one salvo.
- Each non-repeating W press increases throttle by one level; each non-repeating S press decreases it. The five levels are full astern, stop, one-third ahead, two-thirds ahead, and full ahead.
- Default browser behaviour of these keys (scrolling, focus change) MUST be suppressed while the game has focus.

## Host menu

Every player opens the shared menu with Esc. It is titled HOST CONTROL for the host and MENU for other players. C opens Controls for everyone. The host additionally has R for world regeneration, X for a score reset, K for a numbered list of captains to kick, and S for Settings; these actions remain host-only. Select a kick target with `Digit1`–`Digit3` or `Numpad1`–`Numpad3`. Enter or NumpadEnter confirms a pending action; Esc cancels it or returns from kick selection. Confirmations are shown in-game, not in browser dialogs. If host status is lost while the menu is open, host-only pending actions are dropped while the shared menu and Controls remain usable.

In Settings, the rows include Boat speed, Rotation speed, Cannon rotation, Torpedo rotation, Shell speed, Torpedo speed, Cannon reload, Torpedo reload, Land coverage, Map size, Neutral bases, Fuel, Shells, Torpedoes, Resupply time, Capture time, and Repair time (Q120, Q133). Map size MUST default to Standard and offer Small, Standard, and Big; its row MUST immediately follow Land coverage. Up/Down selects a row, Left/Right changes its value, D restores defaults, Enter applies the draft, and Esc returns to the host menu. Changing Map size or Land coverage MUST make the hint say `Enter: apply + new map`; applying either immediately generates a new map while keeping scores.

## Player controls

Each browser stores its own bindings in `localStorage` under `warships.controls`; bindings are client-only and are not sent to the server. Controls lists the 12 actions in the table above. The physical Up/Down arrows select a row regardless of bindings; Enter starts capture, the next non-repeating key is assigned and saved immediately, and Esc cancels capture. Esc outside capture returns to the shared menu. D restores and saves all defaults when not capturing. Escape, Tab, and F3 are reserved and cannot be assigned. Each action has one code after it is changed; assigning a code owned by another action swaps the edited action's previous codes to that action. Torpedo right defaults to both `Backslash` and `IntlBackslash` until changed.

Bindings use `KeyboardEvent.code` so they follow physical key positions. When supported, the client reads `navigator.keyboard.getLayoutMap()` at startup and refreshes it when Controls opens, displaying uppercase printed characters; otherwise it uses friendly QWERTY names. Arrows and Shift retain friendly names. While the shared menu is open, the boat keeps its throttle and ignores all bound game actions.

## In-world indicators

- **Cannon target**: a green "modern" reticle (circle with four ticks and a centre dot) drawn on the map at the aim point, rendered above terrain. Its radius is 30 u, half the 60 u blast radius, so it marks the aim point rather than the full damage zone. The ticks span 25–27.5 u and the centre dot has a 1.25 u radius. The ticks are oriented along the line of fire from the frigate to the aim point. While reloading, a 2 u line-width arc at 33.5 u radius shows reload progress starting at that bearing.
- **Cannon bearing arrow**: a filled triangle in the sight colour, from 60 u to 70 u from the frigate centre with a 4 u half-width, points along the cannon bearing and dims while reloading.
- **Torpedo arrow**: a green, segmented radar-style arrow along the torpedo bearing: five equal shaft dashes from 19 u to 48 u radius, separated by 1.5 u gaps; an open chevron from a 56 u tip to points at 49 u radius and ±4.5 u perpendicular; and a 6 u base tick at 19 u. Its dash and chevron line width is 1.25 u and the base tick line width is 1 u. While reloading, completed dashes fill in, remaining dashes and the chevron dim, and the base tick dims; there is no reload arc.
- **Frigate HP bars**: the small bar below a frigate is shown for enemies only; own hull integrity remains in the bottom-left HUD.
- Indicators are visible **only to their owner**.

## Radar

The bottom-right radar scope has a 90 u HUD radius and 8 u margin. It is north-up, centred on the own frigate, and shows a fixed 3,000 u range. Its clipped disc uses the panel background `rgba(5, 20, 29, .72)`. A cached 800 × 450 land mask uses 1 px per tile: land and the area beyond the world boundary are `rgba(93, 255, 172, .45)`, while water is transparent. It is smoothed at `tileSize × radius / range` (0.6 HUD px per tile). Faint mint rings at one-third and two-thirds range and N–S/E–W crosshair lines use about 0.15 alpha. The functional sweep detector (not merely cosmetic) rotates once every four seconds, with a 0.5-alpha line and a 30° trailing wedge at 0.10 alpha.

The own boat is a white 6 u triangle pointing along its heading. When the sweep crosses another alive frigate's bearing, it paints one contact for that player, including for enemies already on screen. At a distance of 3,000 u or less, the contact is a round 7 u player-coloured dot with a 1 u near-black (`#030d14`) outline at the boat's world position when painted; it stays there rather than following the boat, and a later pass replaces it. Beyond 3,000 u, the sweep paints the existing 7 u player-coloured direction triangle at radius 84 u, with its bearing frozen at paint time. Each contact remains fully visible for 0.3 s, then fades linearly to zero over 2 s. Only alive frigates are eligible to be painted; an existing contact keeps fading if its boat sinks, waits, or leaves. Sinking and waiting frigates cannot be newly painted. Bases within 3,000 u appear as 6 u squares in their owner's colour, or white when neutral. Base squares, boat triangles and the own-base ticks have a 1 u near-black (`#030d14`) outline so every player colour stays visible over the green land (Q121). The player's own bases beyond range appear as a tick on the ring; enemy and neutral bases beyond range are hidden (Q109). Inactive home sites do not appear on the radar (Q120). The mint scope border uses 0.6 alpha and a 1.5 u line. Snapshots still carry every boat's exact position; the radar limits only what is drawn.

## HUD (screen space)

- HUD panels and overlays use the reference screen's fit (contain) scale and are anchored to the browser window edges (Q41, Q56); positions and sizing remain in reference units.
- Top-right: compact scoreboard (name, colour, score) for all connected players, own line highlighted.
- Holding Tab shows the full scoreboard; when settings differ from defaults, it adds a `CUSTOM RULES · …` line listing each changed setting, including Map size.
- Bottom-left: a 440 × 140 u console MUST show hull and fuel dials, cannon and torpedo tiles with current/max counts, status and reload bars, and a vertical throttle telegraph with the selected stop highlighted. Normal arcs and ready bars MUST be green; numbers MUST be white when normal, orange below 20% of capacity, and red when empty; the hull arc and number MUST be red at ≤35 HP (Q108, Q130, Q142).
- A progress ring around the own boat MUST prioritize `Repairing turret` (or `Installing turret` when the base has no turret yet), then `Capturing <time>`, then `Resupplying`. The resupply ring MUST show the least-full of fuel, shells, and torpedoes and disappear when all are full (Q98, Q129).
- The server MUST send fuel and ammunition only for the receiving player's own boat; other players' amounts MUST remain hidden (Q131).
- Event feed (top-left): short messages "Alice sank Bob", "Carol joined", "World regenerated", fading after 5 s.
- Death screen: "Sunk by *X*" + respawn countdown.

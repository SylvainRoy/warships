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
| Upgrade menu | `KeyU` | U |
| Show full scoreboard (hold) | `Tab` | Tab |
| Menu (all players) | `Escape` | Esc |
| Toggle debug | `F3` | F3 |

- Holding a fire key does not auto-fire: one press = one salvo.
- Each non-repeating W press increases throttle by one level; each non-repeating S press decreases it. The five levels are full astern, stop, one-third ahead, two-thirds ahead, and full ahead.
- Default browser behaviour of these keys (scrolling, focus change) MUST be suppressed while the game has focus.

## Host menu

Every player opens the shared menu with Esc. It is titled HOST CONTROL for the host and MENU for other players. C opens Controls and V opens Sound & effects for everyone. Every player can change teams from the Team row; switching removes their frigate without counting a death and respawns them at the new home after the ordinary delay. Switching has a server-enforced 30 s cooldown and is unavailable during intermission. The host additionally has R for world regeneration, X for a score reset, K for a numbered list of captains to kick, and S for Settings; these actions remain host-only. Select a kick target with `Digit1`–`Digit3` or `Numpad1`–`Numpad3`. Enter or NumpadEnter confirms a pending action; Esc cancels it or returns from kick selection. Confirmations are shown in-game, not in browser dialogs. If host status is lost while the menu is open, host-only pending actions are dropped while the shared menu, Controls, and Sound & effects remain usable.

In Settings, the rows include Boat speed, Rotation speed, Cannon rotation, Torpedo rotation, Shell speed, Torpedo speed, Cannon reload, Torpedo reload, Land coverage, Map size, Neutral bases, Fuel, Shells, Torpedoes, Resupply time, Capture time, Repair time, Base income, Bots, Bot skill, Round length, and Treasures & upgrades (Q120, Q133, Q182, Q193, Q248). Map size MUST default to Standard and offer Small, Standard, and Big; its row MUST immediately follow Land coverage. Bots is 0–3, step 1, default 2; Bot skill is Easy, Normal, or Hard, default Normal, and also sets the difficulty of every base turret. Round length is 0–30 minutes in steps of 5, default 10; 0 is Endless. Treasures & upgrades is On by default and disables the economy when Off. Up/Down selects a row, Left/Right changes its value, D restores defaults, Enter applies the draft, and Esc returns to the host menu. Changing Map size or Land coverage MUST make the hint say `Enter: apply + new map`; applying either immediately generates a new map while keeping scores.

The lobby roster marks server-controlled bots with a muted `(bot)` suffix. Bots occupy berths and appear in scoreboards, but do not count against the displayed free slots for human players (Q184). Four team buttons—Blue, Red, Yellow, and Purple—appear beneath the name field, list their current members, and save the selection in local storage. Team colours are shared by teammates in all game views (Q204, Q206).

## Player controls

Each browser stores its own bindings in `localStorage` under `warships.controls`; bindings are client-only and are not sent to the server. Controls lists the 13 actions in the table above. The physical Up/Down arrows select a row regardless of bindings; Enter starts capture, the next non-repeating key is assigned and saved immediately, and Esc cancels capture. Esc outside capture returns to the shared menu. D restores and saves all defaults when not capturing. Escape, Tab, and F3 are reserved and cannot be assigned. Each action has one code after it is changed; assigning a code owned by another action swaps the edited action's previous codes to that action. Torpedo right defaults to both `Backslash` and `IntlBackslash` until changed.

Bindings use `KeyboardEvent.code` so they follow physical key positions. When supported, the client reads `navigator.keyboard.getLayoutMap()` at startup and refreshes it when Controls opens, displaying uppercase printed characters; otherwise it uses friendly QWERTY names. Arrows and Shift retain friendly names. While the shared menu is open, the boat keeps its throttle and ignores all bound game actions.

The Sound & effects panel is available to all players. Up/Down selects Volume or Screen shake; Left/Right changes Volume from 0–100% in 10% steps or toggles shake On/Off. The default is 60% volume with shake On. Changes apply immediately and are saved only in the browser's `warships.effects` localStorage setting; invalid or missing values use defaults. Esc returns to the shared menu.

## In-world indicators

- **Cannon target**: a green "modern" reticle (circle with four ticks and a centre dot) drawn on the map at the aim point, rendered above terrain. Its radius is 30 u, half the 60 u blast radius, so it marks the aim point rather than the full damage zone. The ticks span 25–27.5 u and the centre dot has a 1.25 u radius. The ticks are oriented along the line of fire from the frigate to the aim point. While reloading, a 2 u line-width arc at 33.5 u radius shows reload progress starting at that bearing.
- **Hit feedback**: only the shooter sees a white X marker for 0.3 s and floating white bold `−N` damage number for 1 s after own shell or torpedo damage to an enemy frigate or turret. Nearby repeated hits on one target merge; own hit-feed lines update for the same target within 1 s. Shell hits flash the cannon reticle white for 0.15 s. No marker or damage number is shown for a hit that sinks the target.
- **Cannon bearing arrow**: a filled triangle in the sight colour, from 60 u to 70 u from the frigate centre with a 4 u half-width, points along the cannon bearing and dims while reloading.
- **Torpedo arrow**: a green, segmented radar-style arrow along the torpedo bearing: five equal shaft dashes from 19 u to 48 u radius, separated by 1.5 u gaps; an open chevron from a 56 u tip to points at 49 u radius and ±4.5 u perpendicular; and a 6 u base tick at 19 u. Its dash and chevron line width is 1.25 u and the base tick line width is 1 u. While reloading, completed dashes fill in, remaining dashes and the chevron dim, and the base tick dims; there is no reload arc.
- **Frigate HP bars**: the small bar below a frigate is shown for enemies only; own hull integrity remains in the bottom-left HUD.
- Indicators are visible **only to their owner**.

## Radar

The bottom-right radar scope has a 90 u HUD radius and 8 u margin. It is north-up, centred on the own frigate, and its range scales with map width: 750 u on Small, 1,500 u on Standard, and 3,000 u on Big. Its clipped disc uses the panel background `rgba(5, 20, 29, .72)`. A cached land mask uses 1 px per tile: land and the area beyond the world boundary are `rgba(93, 255, 172, .45)`, while water is transparent. The land mask scales with the radar range (2.4, 1.2, and 0.6 HUD px per tile on Small, Standard, and Big respectively). Faint mint rings at one-third and two-thirds range and N–S/E–W crosshair lines use about 0.15 alpha. The functional sweep detector (not merely cosmetic) rotates once every four seconds, with a 0.5-alpha line and a 30° trailing wedge at 0.10 alpha.

The own boat is a white 6 u triangle pointing along its heading. When the sweep crosses another alive frigate's bearing, it paints one contact for that player, including for enemies already on screen. Teammates appear immediately regardless of sweep. Within the current radar range, the contact is a round 7 u team-coloured dot with a 1 u near-black (`#030d14`) outline at the boat's world position when painted; it stays there rather than following the boat, and a later pass replaces it. Beyond the current range, the sweep paints the existing 7 u team-coloured direction triangle at radius 84 u, with its bearing frozen at paint time. Each contact remains fully visible for 0.3 s, then fades linearly to zero over 2 s. Only alive frigates are eligible to be painted; an existing contact keeps fading if its boat sinks, waits, or leaves. Sinking and waiting frigates cannot be newly painted. Bases within the current range appear as 6 u squares in their team's colour, or white when neutral. Base squares, boat triangles and the own-base ticks have a 1 u near-black (`#030d14`) outline so every team colour stays visible over the green land (Q121, Q206, Q210). Team-owned bases beyond range appear as a tick on the ring; enemy and neutral bases beyond range are hidden (Q109). Inactive home sites do not appear on the radar (Q120). The mint scope border uses 0.6 alpha and a 1.5 u line. Snapshots still carry every boat's exact position; the radar limits only what is drawn.

## HUD (screen space)

- HUD panels and overlays use the reference screen's fit (contain) scale and are anchored to the browser window edges (Q41, Q56); positions and sizing remain in reference units.
- Top-right: the compact scoreboard shows the team-colour dot, name and score only; the own row is highlighted and bold. When any team has at least two members, both scoreboards group players under team-total headers and sort teams by total. Otherwise they retain their current layouts, showing team score for each player. The sunk count appears only in the full Tab scoreboard (Q153, Q212).
- Holding Tab shows the full scoreboard; when settings differ from defaults, it adds a `CUSTOM RULES · …` line listing each changed setting, including Map size.
- While Treasures & upgrades is On, the console shows the personal `$ N` balance. Tab adds money and compact upgrade-level columns; the end screen adds `$ earned` as information only (Q238, Q246, Q249).
- Rebindable U opens the six-track upgrade panel only when the whole own hull is inside an active own-team harbour. Digits 1–6 buy tracks in menu order. U, Esc, or leaving closes it; other gameplay controls remain active. A repair-locked boat sees `Under fire — leave the harbour and come back`; unaffordable tracks are dimmed (Q242–Q243).
- Bottom-left: a 440 × 140 u console MUST show hull and fuel dials, cannon and torpedo tiles with current/max counts, status and reload bars, and a vertical throttle telegraph with the selected stop highlighted. Normal arcs and ready bars MUST be green; numbers MUST be white when normal, orange below 20% of capacity, and red when empty; the hull arc and number MUST be red at ≤35 HP (Q108, Q130, Q142).
- A progress ring around the own boat MUST prioritize `Repairing turret` (or `Installing turret` when the base has no turret yet), then `Capturing <time>`, then `Resupplying`. The resupply ring MUST show the least-full of fuel, shells, torpedoes, and hull, and disappear when all are full (Q98, Q129, Q173).
- The server MUST send fuel and ammunition only for the receiving player's own boat; other players' amounts MUST remain hidden (Q131).
- Event feed (top-left): short messages "Alice sank Bob", "Carol joined", "World regenerated", and, when enemy fire interrupts your own boat's repairs, "Repairs interrupted — leave the harbour and come back", fading after 5 s.
- The Tab scoreboard MUST show each player's active team-owned base count, including home bases, in a `Bases` column after score (Q178).
- Death screen: "Sunk by *X*" + respawn countdown.
- Round timer: a top-centre `mm:ss` countdown in the top band, orange below 60 s and red below 10 s; hidden in Endless and during intermission.
- Round end: a centred results panel shows `ROUND OVER`, winners or `Draw`, and Captain, Score, Sinks, Deaths, Accuracy, and Bases. It highlights the own row and counts down to the next round. During intermission, only Esc and Tab work.

## Sound and damage effects

Sound effects are synthesised in code with Web Audio; there are no audio assets, music, or engine hum. Fire, splash, explosion, torpedo, hull damage, sinking, turret, radar-contact, capture, turret-install/repair, and resupply-complete sounds use the specified distinct synthesised cues. World sounds attenuate from 400 u to silence at 1,600 u and pan with world x position; own-boat sounds are centred and full volume. Sound is enabled after the first user gesture. The volume setting controls the master output; sounds are rate-limited and capped at 12 concurrent voices.

Own-boat damage from any cause shakes only the world layer for 0.3 s when Screen shake is On, with an 8 u maximum amplitude scaled by damage and decaying linearly. A red vignette always flashes over the frame for 0.3 s. Shake changes only the camera offset; the 1600 × 900 u visible-area clip and HUD remain fixed.

Base income shows every member of the owning team a floating `+1` in the team's colour above the building, rising 30 u over 1.2 s and fading over the last 0.4 s. Teammates hear a quiet, centred coin tick.

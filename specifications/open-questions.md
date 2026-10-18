# Decisions

All questions raised during the specification phase are resolved. Each line gives the decision, which is already reflected in the specification documents.

## Game design

- **Q0 — Name:** Warships.
- **Q1 — Mode:** free-for-all only, no teams.
- **Q2 — Bots:** none in v1.
- **Q3 — Sound:** none in v1.
- **Q4 — World shape:** 16 000 × 9 000 u (10 × 10 reference screens).
- **Q5 — Land coverage:** 20–30 %, a dozen large islands plus many small ones.
- **Q6 — Camera:** north-up, centred on own frigate.
- **Q7 — Minimap:** none. Replaced by Q61.
- **Q8 — Turning:** a frigate can turn on the spot (constant rate).
- **Q9 — Collisions:** touching land costs 20 HP (one cannon shell), at most once per second while in contact; frigate-vs-frigate contact causes no damage. Amounts superseded by Q27 and Q36.
- **Q10 — Damage model:** 100 HP; shell 20 HP; torpedo 50 HP; no regeneration. Amounts superseded by Q36.
- **Q11 — Aim reference:** aims are relative to the hull (turn with the boat).
- **Q12 — Cannon range control:** Up/Down arrows adjust range.
- **Q13 — Cannon max range:** 800 u.
- **Q14 — Torpedo reload:** 8 s.
- **Q15 — Torpedo lifetime:** until land, a frigate or the world edge; no max range.
- **Q16 — Keyboard layout:** physical key positions; must work on Mac and PC.
- **Q17 — Aim indicators:** visible only to their owner.

## Rules & multiplayer

- **Q18 — Scoring:** +1 per sink to the killer; −1 for sinking yourself (own weapons or land); nothing for damage.
- **Q19 — Score on disconnect:** lost, except reconnection within 10 s.
- **Q20 — Server full:** extra players wait in the lobby (no spectating).
- **Q21 — Host succession:** longest-connected player becomes host; no password.
- **Q22 — Kick:** the host can kick a player.

## Technical

- **Q23 — Stack:** TypeScript + Canvas client, Node.js + WebSocket server.
- **Q24 — Hosting:** local network first; GCP in a later phase.
- **Q25 — Repository visibility:** public.

## Playtest decisions — 2026-10-16

- **Q26 — Throttle telegraph:** W/S step the throttle levels −1 full astern, 0 stop, 1 one-third ahead, 2 two-thirds ahead, and 3 full ahead; show all levels and highlight the selected setting in the HUD. Decided 2026-10-16 after playtest.
- **Q27 — Speed-scaled land damage:** damage is zero below 20 u/s impact speed; otherwise round `20 × min(1, impact speed / 80)`, limited to once per second and disabled during spawn protection. Decided 2026-10-16 after playtest. Maximum superseded by Q36.
- **Q28 — Channel width:** every water tile belongs to an all-water 8 × 8 tile square, giving channels a minimum width of 160 u. Decided 2026-10-16 after playtest.
- **Q29 — Frigate speeds:** maximum forward speed 80 u/s, reverse speed 25 u/s, acceleration 40 u/s², with no drag. Decided 2026-10-16 after playtest.
- **Q30 — Torpedo spread:** fire the three torpedoes at −2°, 0°, and +2°. Decided 2026-10-16 after playtest.

## Playtest decisions — 2026-10-17

- **Q31 — Own frigate HP bar:** show the small HP bar below enemy frigates only; own hull integrity remains in the HUD. Decided 2026-10-17 after playtest.
- **Q32 — Torpedo indicator:** use a five-dash radar-style arrow with an open chevron and base tick; show reload by filling completed dashes, dimming the rest, and no reload arc. Decided 2026-10-17 after playtest.
- **Q33 — Cannon sight orientation:** orient the four reticle ticks along the line of fire from the frigate to the aim point and start the reload arc at that bearing. Decided 2026-10-17 after playtest.
- **Q34 — Camera framing:** keep the frigate and the cannon reticle (including its 60 u radius) on screen by shifting the world-clamped camera as needed; show boundary land when the view extends beyond the world. Decided 2026-10-17 after playtest. Replaced by Q51.
- **Q35 — HUD corner margin:** the hull-integrity/throttle panel and the captains panel sit 8 px from their screen corners. Decided 2026-10-17 after playtest.
- **Q36 — Damage halved:** cannon shell 10 HP, torpedo 25 HP, and land collision up to 10 HP, with no change to the graze threshold or interval; a frigate now takes 10 shells or 4 torpedoes to sink. Decided 2026-10-17 after playtest.
- **Q37 — Host action confirmation:** host actions are confirmed inside the game (Enter confirms, Esc cancels; kick target chosen with 1–3) instead of browser dialogs, which some browsers/frames block. Decided 2026-10-17 after playtest.
- **Q38 — Spawn clearance:** a spawn point is valid only if no land tile lies within 60 u of the frigate hull at any heading (disc of radius hull half-diagonal + 60 u), checked tile by tile. Decided 2026-10-17 after playtest.
- **Q39 — Shell speed:** cannon shells travel at 800 u/s (was 500); max-range flight is 1.0 s, with range unchanged. Decided 2026-10-17 after playtest.
- **Q40 — Shell look:** shells are pointed black projectiles with a thin pale outline, nose along the flight direction, keeping the parabolic size and shadow. Decided 2026-10-17 after playtest.
- **Q41 — HUD anchoring:** HUD is laid out in the full browser window, scaled by the reference scale, so the Q35 8 px margins hold at any aspect ratio. Decided 2026-10-17 after playtest.
- **Q42 — Settings menu:** add `S Settings` to the host menu. Up/Down selects a setting, Left/Right changes it, D restores defaults, Enter applies, and Esc returns to the host menu. Decided 2026-10-17 after playtest.
- **Q43 — Settings limits:** boat speed, rotation, shell speed, and torpedo speed range from 50% to 200% in 10% steps; cannon reload ranges from 0.5 to 10 s in 0.5 s steps; torpedo reload ranges from 1 to 20 s in 0.5 s steps. Decided 2026-10-17 after playtest.
- **Q44 — Applying settings:** settings apply immediately; projectiles already in flight and reloads already in progress retain their values. Decided 2026-10-17 after playtest.
- **Q45 — Settings feedback:** announce changed values as `Host <name>: <changes>` in the event feed and list custom values on the Tab scoreboard as `CUSTOM RULES · …`. Decided 2026-10-17 after playtest.
- **Q46 — Settings persistence:** settings survive world regeneration and host succession, but reset to defaults on server restart. Decided 2026-10-17 after playtest.
- **Q47 — Settings effects:** boat speed scales forward/reverse top speeds and acceleration; land damage is relative to the scaled forward top speed while the graze threshold stays 20 u/s; rotation scales by percentage; shell range and torpedo arming delay are unchanged. Decided 2026-10-17 after playtest.
- **Q48 — New base values:** at 100%, boat top speed is 48/15 u/s with 24 u/s² acceleration (60% of before), rotation is 36°/s (80%), shells are 400 u/s (50%), torpedoes are 120 u/s (50%), cannon reload is 1.5 s, and torpedo reload is 4 s; the graze threshold stays 20 u/s. Decided 2026-10-17 after playtest. Q48 replaces the previous base values in Q14, Q29, and Q39.
- **Q49 — Projectile sync:** each shell and torpedo is sent once when fired; clients advance it along its known path, and the server announces only torpedoes that end early (hit, land, out of bounds), keeping 4-player sustained fire under 50 kB/s per client. Decided 2026-10-17.
- **Q50 — Aim rotation settings:** add host settings for cannon rotation and torpedo rotation (50–200%, 10% steps, default 100%); at 100% both bearings turn at 54 °/s, 60% of the previous 90 °/s. Decided 2026-10-17 after playtest.
- **Q51 — Camera framing (revised):** the camera stays centred on the own frigate and clamps at the world edges; the cannon reticle no longer moves it and may be off screen. Replaces Q34. Decided 2026-10-17 after playtest.
- **Q52 — Cannon bearing arrow:** a filled triangle in the sight colour, 120–140 u from the frigate centre, just beyond the torpedo arrow tip, always shown and dimmed while the cannons reload. Decided 2026-10-17 after playtest. Its dimensions are revised by Q59.
- **Q53 — Land coverage setting:** coverage is the real share of the map; the host setting ranges from 5–40% in 5% steps, default 25%; generation fails above 40%. Decided 2026-10-17 after playtest.
- **Q54 — Applying land coverage:** changing the setting immediately regenerates the map while keeping scores. Decided 2026-10-17 after playtest.
- **Q55 — Land coverage tolerance:** generated coverage may differ from the target by ±2.5 percentage points, replacing the previous 20–30% band. Decided 2026-10-17 after playtest.
- **Q56 — Non-16:9 windows:** keep the fixed 16:9 frame with plain bands (no terrain drawn outside the frame), so every player sees exactly 1600 × 900 u; terrain chunks overlap by one tile and are built at integer resolution to avoid seams. A cover-scale fill was tried and rejected because the visible area would depend on window shape. Decided 2026-10-17 after playtest.
- **Q57 — Frigate scale:** halve the frigate's drawn and collision hull to 30 × 10 u, with 5 u hit circles at offsets −10, 0, and 10 u and a 7.5 u cannon shell offset. Keep the 60 u cannon damage radius and land clearance unchanged. Decided 2026-10-17 after playtest.
- **Q58 — Cannon sight size:** keep the 60 u sight circle and reload ring; reduce the centre dot radius to 1.25 u and place the ticks from 50 to 55 u. Decided 2026-10-17 after playtest. The sight size is revised by Q60.
- **Q59 — Aim-marker size:** halve the cannon arrow to a 60–70 u triangle with 4 u half-width; shorten the torpedo arrow to 19–48 u shaft dashes, a 56 u tip, a 49 u chevron base with ±4.5 u width, and a 19 u base tick with ±3 u width. Use 1.25 u dash/chevron lines and a 1 u base-tick line. Decided 2026-10-17 after playtest.
- **Q60 — Cannon sight size (revised):** use a 30 u reticle radius, half the 60 u blast radius, to mark the aim point rather than the full damage zone; ticks span 25–27.5 u and the reload ring sits 3.5 u outside the reticle. Keep the 60 u damage radius and 1.25 u centre dot unchanged. Decided 2026-10-17 after playtest.
- **Q61 — Radar scope:** add a north-up radar at bottom-right, centred on the own frigate, showing land, a cosmetic sweep, and other afloat frigates. Decided 2026-10-17.
- **Q62 — On-screen radar contacts:** enemies that are already visible on screen still receive radar pips. Decided 2026-10-17.
- **Q63 — Radar vessel visibility:** show only afloat boats; exclude sinking and waiting frigates. Decided 2026-10-17.
- **Q64 — Radar position privacy:** snapshots continue to carry every boat's exact position; radar only limits what is drawn. Accepted for now. Decided 2026-10-17.
- **Q65 — Radar object rules:** each object kind uses position, direction-only, or hidden radar visibility. Decided 2026-10-17.
- **Q66 — Radar range:** use a fixed 3,000 u range; a host setting may be added later. Decided 2026-10-17.
- **Q67 — Boat wakes:** use a V-shaped forward wake scaled by speed; astern motion leaves a churn band only. Decided 2026-10-17.
- **Q68 — Torpedo wakes:** leave a 150 u bubble trail behind each torpedo to reveal roughly where it came from. Decided 2026-10-17.
- **Q69 — Wake persistence and speed settings:** forward boat samples live 3 s, astern churn samples 1 s, and torpedo trails extend up to 1.25 s of travel (150 u at default speed); reach follows the host speed settings. Decided 2026-10-17.
- **Q70 — Wake networking:** wakes are visual and client-only, add no network data, and do not appear on radar. Decided 2026-10-17.
- **Q71 — Wake lifecycle:** a sinking boat's wake fades in place, and a respawn starts a fresh wake. Decided 2026-10-17.
- **Q72 — Terrain style:** use the natural terrain style selected from the Q72–Q76 mock-ups. Decided 2026-10-17.
- **Q73 — Terrain detail:** render beaches, grass, forest, and rock; add no buildings. Decided 2026-10-17.
- **Q74 — Shallow-water width:** use about 60 u of turquoise shallows, halved after the mock-up; terrain colors are visual only. Decided 2026-10-17.
- **Q75 — Terrain contrast:** keep boats, wakes, and the sight legible against the terrain; leave the radar unchanged. Decided 2026-10-17.
- **Q76 — Mock-up process:** render terrain-style mock-ups before implementing the selected natural style as the real feature. Decided 2026-10-17.
- **Q77 — Cannon sight on spawn:** start every frigate at the minimum cannon range (100 u), bearing straight ahead, so the player sees the sight immediately. Decided 2026-10-17 after playtest.
- **Q78 — Key binding storage:** keep player bindings per browser in localStorage under `warships.controls`; no server or protocol changes. Decided 2026-10-17.
- **Q79 — Remappable actions and defaults:** support throttle up/down, hull left/right, cannon left/right, range +/−, fire cannons, torpedo left/right, and fire torpedoes in that order; fire torpedoes defaults to `Backslash` and `IntlBackslash`. Escape, Tab, and F3 are reserved. Decided 2026-10-17.
- **Q80 — Shared menu:** Esc opens the menu for every player and C opens Controls; R/X/K/S and their flows remain host-only, and a player losing host status keeps the shared menu while host-only pending actions are dropped. Decided 2026-10-17.
- **Q81 — Controls navigation and capture:** physical Up/Down select rows, Enter starts capture, the next non-repeat key is assigned and saved immediately, Esc cancels capture or returns to the menu, and D restores defaults outside capture; prevent default while capturing except in an input. Decided 2026-10-17.
- **Q82 — Binding assignment:** keep one code per action after a change; assigning another action's code swaps the edited action's previous codes to that action, and reserved codes are rejected with a hint. Decided 2026-10-17.
- **Q83 — Binding labels:** bind by `KeyboardEvent.code`; use the asynchronous keyboard layout map when available and friendly QWERTY names otherwise, keeping arrows and Shift friendly. Decided 2026-10-17.
- **Q84 — Menu input:** while the menu is open, retain the boat's throttle and ignore every bound game action. Decided 2026-10-17.
- **Q85 — Revised default keys:** after playtesting, fire cannons defaults to `Space`, torpedo right to `Backslash` and `IntlBackslash`, and fire torpedoes to `BracketRight`; supersedes the fire defaults in Q79. Decided 2026-10-17.
- **Q86 — Release version:** the first public release is `v1.0.0`; release versions follow semantic versioning and are independent of the specification version. Decided 2026-10-18.
- **Q87 — Release tags:** each release is an annotated git tag `vX.Y.Z` on main. Decided 2026-10-18.
- **Q88 — Release notes:** each tag gets a GitHub Release with short notes (features, how to run, specification version). Decided 2026-10-18.
- **Q89 — Visible version:** the client lobby and the server startup log show the version from `package.json`. Decided 2026-10-18.
- **Q90 — Later releases:** patch for fixes, minor for new features, major for breaking changes such as incompatible clients; bump `package.json` and add a CHANGELOG.md entry before tagging. Decided 2026-10-18.
- **Q91 — Home and neutral sites:** always four home sites, one per player slot, plus neutral bases; a slot's home is inactive without a player, and leaving deactivates that home and neutralizes the player's other bases. Decided 2026-10-18.
- **Q92 — Base spacing:** any two bases must be at least 1,600 u apart. Decided 2026-10-18.
- **Q93 — Base layout:** a 40 × 40 u building sits on existing coastal land with a 60 × 60 u open-water harbour directly in front; terrain is unchanged, boats are blocked as by land, shells fly over, and the generator tries the next seed if all bases cannot fit. Decided 2026-10-18.
- **Q94 — Base flags and harbour actions:** flags use the owner's colour or white when neutral; the whole hull must be inside a harbour for its actions. Decided 2026-10-18.
- **Q95 — Resupply:** at an owned base with throttle STOP, fuel and ammunition refill gradually from empty to full in a host-set 1–30 s (1 s step, default 5 s); leaving stops resupply. Decided 2026-10-18.
- **Q96 — Capture:** continuously occupy an unowned harbour for a host-set 1–30 s (1 s step, default 5 s); any throttle is allowed, but leaving, sinking, or another boat in the harbour resets progress; enemy bases require a destroyed turret and neutral bases have none. Decided 2026-10-18.
- **Q97 — Turret repair and installation:** remain in an owned harbour without firing for a host-set 1–30 s (1 s step, default 5 s) to rebuild or install a turret; firing restarts progress, and repair runs alongside resupply. Decided 2026-10-18.
- **Q98 — Harbour progress:** show a ring around the own boat labelled `Resupplying`, `Capturing <time>`, or `Repairing turret`. Decided 2026-10-18.
- **Q99 — Turret behaviour:** range 600 u; one cannon shell every 3 s at the nearest enemy in range, aimed at its current position without leading; ignore spawn-protected and owner boats; neutral and inactive sites have no turret. Decided 2026-10-18.
- **Q100 — Turret damage:** 60 HP (six direct shell hits); only shells damage turrets, owners' shells do not damage their own turrets, and destroyed turrets appear as rubble. Decided 2026-10-18.
- **Q101 — Home-base capture score:** the original owner loses 5 points and the capturer gains 5; scores may be negative. Decided 2026-10-18.
- **Q102 — Home-base return:** a lost home returns to its owner after 30 s with a full turret; until then, respawn at another owned base or, if none, at a random point using the v1 rule. Decided 2026-10-18.
- **Q103 — Fuel capacity:** fuel use is proportional to distance sailed forward or astern; capacity is the Fuel crossings setting times map width, 1–10 crossings in steps of 1, default 2 (32,000 u, about 11 min at full speed); stopped boats use none. Decided 2026-10-18.
- **Q104 — Empty tank:** limit forward and astern maximum speed to 10% (about 5 u/s); turning and firing still work. Decided 2026-10-18.
- **Q105 — Ammunition:** one shell per cannon salvo and one torpedo per spread; empty ammunition prevents firing. Shell capacity is 10–200 (step 10, default 50); torpedo capacity is 5–100 (step 5, default 30). Decided 2026-10-18.
- **Q106 — Spawn:** spawn in the home harbour facing open water with full fuel, ammunition, and hull; if the home is lost, use Q102; retain 3 s spawn protection. Decided 2026-10-18.
- **Q107 — New host settings:** neutral bases 0–8, default 4, regenerate the map when changed; add fuel crossings, shell and torpedo capacity, and resupply/capture/repair times; fuel and ammunition changes apply immediately and clamp current amounts to the new maximum. Decided 2026-10-18.
- **Q108 — Fuel and ammunition HUD:** show a fuel gauge and shell and torpedo counts bottom-left; fuel is orange below 20% and red when empty. Decided 2026-10-18.
- **Q109 — Base radar:** within 3,000 u show bases as small owner-coloured squares (white for neutral); show own bases beyond range as a ring tick and hide enemy/neutral bases beyond range. Decided 2026-10-18.
- **Q110 — New map and score reset:** re-place all bases and give each player their home back on a new map; resetting scores does not change bases. Decided 2026-10-18.
- **Q111 — Delivery:** write spec v2.0 first, then deliver three steps on separate branches from main with previews and approval before merge: (1) bases, flags, home spawn, capture; (2) turrets, repair, home-base rule; (3) fuel, ammunition, resupply. Tag v2.0.0 after step 3. Decided 2026-10-18.
- **Q112 — Leaving during resupply:** resupply stops, but fuel and ammunition already refilled stay on board. Decided 2026-10-18.
- **Q113 — Interrupted turret repair:** leaving the harbour or sinking restarts the repair countdown from zero. Decided 2026-10-18.
- **Q114 — Capturing a lost home base:** its owner may recapture it normally for no points, cancelling the return timer; a third player capturing it during the timer gains 5 points, the owner is not penalized again, and the 30 s countdown continues. Decided 2026-10-18.
- **Q115 — Non-home base capture score:** capturing a neutral or non-home enemy base gives no points. Decided 2026-10-18.
- **Q116 — Owner leaves while home is lost:** the return countdown stops and the home site becomes inactive. Decided 2026-10-18.
- **Q117 — Disconnect grace:** bases remain owned during the 10 s reconnect grace; Q91 leave effects apply only when the grace expires. Decided 2026-10-18.
- **Q118 — New-map ownership:** every non-home base starts neutral on a new map. Decided 2026-10-18.
- **Q119 — Time setting changed during an action:** the new time applies immediately, preserving progress as a fraction of the action. Decided 2026-10-18.
- **Q120 — Minor v2 details:** neutral-bases setting step 1; minimum 1,600 u spacing measured between harbour centres; buildings stand on land so torpedoes stop there and rubble adds no collision; new settings rows follow Land coverage in order Neutral bases, Fuel, Shells, Torpedoes, Resupply time, Capture time, Repair time; inactive home sites do not appear on radar. Decided 2026-10-18.
- **Q121 — Radar marker contrast:** base squares grow to 6 u, and base squares, boat triangles and own-base ticks get a 1 u near-black outline so blue (and every player colour) stays visible over the green radar land. Decided 2026-10-18.
- **Q122 — Turret position:** the turret stands on the base building; range is measured from the building centre. Decided 2026-10-18.
- **Q123 — Turret shell ownership:** turret shells belong to the base owner (kill credit +1, feed `<owner>'s turret sank <name>`) and never damage the owner's boats or turrets. Decided 2026-10-18.
- **Q124 — Turret hit test:** a shell landing within 60 u of the building square deals 10 damage to its turret. Decided 2026-10-18.
- **Q125 — Owner recaptures lost home:** restored as on automatic return, with a full turret. Decided 2026-10-18.
- **Q126 — Holder of a lost home leaves:** the home returns to its original owner immediately, with a full turret. Decided 2026-10-18.
- **Q127 — Fuel burn:** fuel is burned at |speed| × time, so sliding along a coast or being pushed doesn't burn fuel; with an empty tank the speed limit is 10% of the scaled top speed, both ways. Decided 2026-10-18.
- **Q128 — Resupply condition:** STOP means the commanded throttle level, not an exact speed of 0; all three resources refill at the same time, each from empty to full in the resupply time; firing doesn't interrupt resupply. Decided 2026-10-18.
- **Q129 — Ring priority:** Repairing turret, then Capturing, then Resupplying; the resupply ring shows the least-full resource and disappears once all are full. Decided 2026-10-18.
- **Q130 — Ammunition colours:** the shell and torpedo counts use the same colours as fuel (orange below 20%, red when empty). Decided 2026-10-18.
- **Q131 — Only the own boat's fuel and ammunition are sent; other players' amounts stay hidden.** Decided 2026-10-18.
- **Q142 — Bottom-left console HUD:** replace the bottom-left bars with hull/fuel dials, cannon/torpedo tiles (count, max, status, reload bar), and vertical throttle stops; numbers are white normally, orange below 20%, or red when empty, with the hull number red at ≤35 HP. Decided 2026-10-18.
- **Q143 — Join on an already-joined connection:** a same-name repeat (case-insensitive) resends the current welcome; a different-name repeat removes the previous session without closing the socket before creating the new session. Decided 2026-10-18.

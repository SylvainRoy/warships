# Warships — Specifications

**Status: APPROVED v2.8** (2026-10-20) — game release v2.0.0 implements spec v2.5; release v1.0.0 implemented spec v1.18.

| # | Document | Content |
|---|----------|---------|
| 01 | [Overview](01-overview.md) | Pitch, scope, platform, glossary |
| 02 | [World](02-world.md) | Units, map size, terrain, generation, camera |
| 03 | [Frigate](03-frigate.md) | Dimensions, movement, collisions, hull |
| 04 | [Weapons](04-weapons.md) | Cannons and torpedoes |
| 05 | [Controls & HUD](05-controls-and-hud.md) | Key bindings, on-screen indicators |
| 06 | [Game rules](06-game-rules.md) | Spawning, sinking, scoring |
| 07 | [Multiplayer & host](07-multiplayer.md) | Joining, player slots, host privileges |
| 08 | [Technical architecture](08-architecture.md) | Stack, networking, deployment, performance |
| 09 | [Bases](09-bases.md) | Home and neutral bases, harbours, capture, and turrets |
| — | [Decisions](open-questions.md) | Q&A log of design decisions |

## Conventions

- **MUST / SHOULD / MAY** are used in their usual RFC 2119 sense.
- Decisions taken on questions are recorded in [open-questions.md](open-questions.md).
- All gameplay numbers are expressed in **world units (u)** and **seconds (s)**, never in pixels or centimetres (see [02-world.md](02-world.md#units)). They are tunable constants and will live in a single configuration file in the code.

## Changelog

- v2.8 — configurable server-side bots with navigation, combat, capture, and resupply (Q182–Q192).
- v2.7 — hull repair in owned harbours and income from held non-home bases (Q172–Q181).
- v2.6 — synthesised sound effects, sound and effects settings, and hit and own-damage feedback (Q160–Q171).
- v2.5 — faster boats, shells and torpedoes (Q154–Q159).
- v2.4 — compact scoreboard shows only each player's score (Q153).
- v2.3 — sweep-detected radar contacts with map-size-scaled range (Q145–Q152).
- v2.2 — bottom-left HUD redesigned as a ship's console (Q142).
- v2.1 — host map size setting: Small / Standard / Big (Q132–Q141).
- v2.0 — bases (home and neutral), harbours, capture, turrets, fuel and ammunition (Q91–Q131).
- v1.18 — show the game version in the lobby and the server log; release versioning and changelog (Q86–Q90); approved 2026-10-18.
- v1.17 — player-configurable key bindings stored per browser, Controls menu for every player, and revised fire/torpedo defaults after playtesting (Q78–Q85); approved 2026-10-17.
- v1.16 — the cannon sight starts at minimum range (100 u) on every spawn so it is visible (Q77); approved 2026-10-17.
- v1.15 — natural terrain with rounded 60 u shallows, smooth biome transitions, beaches, grass, forest, and noise-gated rock (Q72–Q76); approved 2026-10-17.
- v1.14 — add speed-scaled V wakes for frigates and bubble trails behind torpedoes (Q67–Q71); approved 2026-10-17.
- v1.13 — add a north-up 3,000 u radar scope with vessel direction pips and a land mask (Q61–Q66); approved 2026-10-17.
- v1.12 — halve the cannon reticle radius while retaining the 60 u blast radius (Q60); approved 2026-10-17.
- v1.11 — halve the frigate's drawn and collision size, and shrink the aim markers while retaining the 60 u cannon sight (Q57–Q59); approved 2026-10-17.
- v1.10 — fixed 16:9 frame with plain letterbox bands; no terrain pop-in or seams (Q56); approved 2026-10-17.
- v1.9 — host-adjustable land coverage from 5% to 40%, with immediate map regeneration (Q53–Q55); approved 2026-10-17.
- v1.8 — camera stays centred on the frigate (Q51); cannon bearing arrow next to the frigate (Q52); approved 2026-10-17.
- v1.7 — host-adjustable cannon and torpedo aim rotation settings (Q50); approved 2026-10-17.
- v1.6 — send projectiles once on spawn and simulate their paths on clients, with torpedo removal/reset messages to keep bandwidth below 50 kB/s (Q49); approved 2026-10-17.
- v1.5 — host game settings: boat/rotation/shell/torpedo speed percentages and reload times (Q42–Q47); new base values (Q48); approved 2026-10-17.
- v1.4 — faster shells drawn as pointed black shells; HUD anchored to window corners; approved 2026-10-17 after playtest.
- v1.3 — fix spawns overlapping land (exact clearance check) and replace browser confirmation dialogs with in-game host-menu confirmation; approved 2026-10-17 after playtest.
- v1.2 — hide the own frigate HP bar, replace the torpedo indicator with a segmented arrow, align cannon reticle ticks with the line of fire, keep the cannon reticle on screen, move HUD panels to 8 px from screen corners, and halve all damage; approved 2026-10-17 after playtest.
- v1.1 — easier throttle controls, speed-scaled land damage, wider channels, reduced frigate speeds, and a wider torpedo spread; approved 2026-10-16 after playtest.
- v1.0 — approved.
- v0.3 — all questions resolved: no minimap (Q7), land collisions cause 20 HP damage (Q9), defaults accepted for the rest.
- v0.2 — integrated answers to Q0, Q8, Q10–Q13, Q15, Q16, Q24, Q25.
- v0.1 — complete rewrite of the initial draft.

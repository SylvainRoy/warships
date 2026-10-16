# Warships — Specifications

**Status: DRAFT v0.3 — all questions resolved, awaiting approval.** Implementation starts only once this file says *Approved*.

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
| — | [Decisions](open-questions.md) | Q&A log of design decisions |

## Conventions

- **MUST / SHOULD / MAY** are used in their usual RFC 2119 sense.
- Decisions taken on questions are recorded in [open-questions.md](open-questions.md).
- All gameplay numbers are expressed in **world units (u)** and **seconds (s)**, never in pixels or centimetres (see [02-world.md](02-world.md#units)). They are tunable constants and will live in a single configuration file in the code.

## Changelog

- v0.3 — all questions resolved: no minimap (Q7), land collisions cause 20 HP damage (Q9), defaults accepted for the rest.
- v0.2 — integrated answers to Q0, Q8, Q10–Q13, Q15, Q16, Q24, Q25.
- v0.1 — complete rewrite of the initial draft.

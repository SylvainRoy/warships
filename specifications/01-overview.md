# 01 — Overview

## Pitch

*Warships* is an online multiplayer naval combat game seen from above in 2D. Each player commands a frigate armed with **cannons** (ballistic, fire over islands) and **torpedoes** (underwater, blocked by land). Players roam an archipelago, manage fuel and ammunition, capture bases, and sink each other to score points. The game never ends: it is a persistent free-for-all.

## Key characteristics

| Aspect | Decision |
|---|---|
| Players per game | 1 to 4, first come first served |
| Games per server | Exactly one, running indefinitely |
| Mode | Free-for-all deathmatch, no teams |
| View | 2D top-down, camera follows own frigate |
| Platform | Desktop web browser, keyboard only. No installation for players |
| Session control | First connected player is the **host**: can regenerate the world and reset scores |
| v2 bases | Four home sites, configurable neutral bases, harbours, and turrets |

## In scope (v1)

- One persistent game per server, 4 player slots.
- Procedurally generated world with islands; all water connected.
- Frigate movement with inertia; cannons; torpedoes; damage; sinking; respawn; scoreboard.
- Host controls: regenerate world, reset scores.

## In scope (v2 draft)

- Home and neutral bases, harbour resupply and capture, turrets, and home-base loss and return.
- Distance-based fuel consumption and finite cannon and torpedo ammunition.
- Host settings for neutral bases, fuel capacity, ammunition capacity, and harbour-action times.

## Out of scope (v1) — candidates for later

- Mobile / touch controls, gamepads.
- Accounts, persistence of scores across server restarts, matchmaking, multiple rooms per server.
- AI-controlled boats (bots).
- Power-ups, ship upgrades, different ship classes.
- Chat.
- Sound and music.

## Glossary

| Term | Meaning |
|---|---|
| **u** | World unit, see [02-world.md](02-world.md#units) |
| **Screen** | The reference viewport: 1600 × 900 u |
| **Frigate / boat** | The ship controlled by a player |
| **Hull heading** | Direction the frigate's bow points to |
| **Cannon bearing / torpedo bearing** | Aim direction of each weapon, relative to the hull heading |
| **Host** | The player with administrative rights on the server |
| **Tick** | One step of the server simulation |

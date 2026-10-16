# 03 — Frigate

## Dimensions and appearance

- Length **60 u**, beam (width) **20 u**. Collision shape: a rotated rectangle (or capsule) of that size.
- Each player has a distinct colour (slot 1–4: e.g. blue, red, yellow, purple). The colour is used for the hull, the name label and the scoreboard.
- The player's name is displayed above their frigate. A health bar is displayed under it.
- Visual style: simple flat vector graphics; a wake trail behind moving boats.

## Movement model

The frigate has inertia: keys apply acceleration, not instant speed.

| Parameter | Value |
|---|---|
| Max forward speed | **160 u/s** — crosses a screen (1600 u) in 10 s |
| Max reverse speed | 50 u/s |
| Forward acceleration (W) | 80 u/s² — full speed in 2 s |
| Reverse acceleration (S) | 80 u/s² (also acts as a brake while moving forward) |
| Drag when no key pressed | speed decays to 0 in ≈ 4 s |
| Rotation (A / D) | 45 °/s, independent of speed: a stopped frigate can turn on the spot |

- Velocity is always along the hull heading (no sideways drift).
- W and S together cancel; A and D together cancel.

## Collisions

- **Frigate vs land / world edge**: the frigate stops at the shore (velocity component into the land is cancelled, it can slide along the coast) and takes **20 HP of damage**, the same as one cannon shell.
  - Land damage is applied when contact starts, then at most once per second while contact continues (pushing against a coast costs 20 HP per second).
  - Land damage applies at any speed, including in reverse, but not during spawn protection.
  - A frigate sunk by land damage counts as sinking itself ([06-game-rules.md](06-game-rules.md#scoring)).
- **Frigate vs frigate**: frigates cannot overlap; they are pushed apart and both lose their speed. No damage, i.e. no ramming.

## Hull points

- Each frigate has **100 hull points (HP)**.
- Damage values are defined in [04-weapons.md](04-weapons.md). At 0 HP the frigate sinks ([06-game-rules.md](06-game-rules.md)).
- No regeneration of HP while alive.

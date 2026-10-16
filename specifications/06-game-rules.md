# 06 — Game rules

## Spawning

A frigate spawns when its player joins, after being sunk, and when the world is regenerated.

- Position: a random water point such that
  - the whole frigate is on water with at least 60 u clearance from land,
  - it is at least **2 400 u** (1.5 screen widths) from every other living frigate (proposed). If no such point is found after N attempts, the point maximising the distance to the nearest frigate is used.
- Heading: random. Speed: 0. HP: full. Weapons: loaded; cannon range set to maximum, bearings pointing forward.
- **Spawn protection**: 3 s of invulnerability, ended early if the player fires (proposed). Shown by a blinking hull.

## Sinking

- A frigate sinks when its HP reaches 0. A short sinking animation plays (≈ 2 s); the wreck does not block anything.
- **Respawn delay: 3 s** after sinking (proposed).
- Projectiles fired before sinking stay active and can still score.

## Scoring

- **+1 point** to the player whose shell or torpedo dealt the final damage (proposed, Q18).
- Sinking yourself (own shell / torpedo): no point gained, **−1 point** (proposed, Q18).
- No points for damage that does not sink.
- Scores are kept for as long as the player stays connected; a player leaving loses their score (proposed, Q19).
- The scoreboard also shows the number of times each player was sunk (proposed).
- There is no win condition: the game is infinite. The host may reset scores (see [07-multiplayer.md](07-multiplayer.md)).

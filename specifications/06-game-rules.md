# 06 — Game rules

## Spawning

A frigate spawns when its player joins, after being sunk, and when the world is regenerated.

- Normally, a frigate spawns in its home harbour facing open water. It spawns with full fuel, shells, torpedoes, and hull; the cannon range is at minimum (100 u), and bearings point forward (Q106).
- If its home base has been lost, the player respawns at another base they own. If they own no other base, use the v1 random-point rules below (Q102).
- Every spawn starts at speed 0.
- Random-point fallback: choose a water point such that
  - the whole frigate is on water with at least 60 u clearance from land,
  - it is at least **15% of the current map width** from every other living frigate: 2 400 u on Big, 1 200 u on Standard, or 600 u on Small (Q138). If no such point is found after N attempts, the point maximising the distance to the nearest frigate is used.
- For a random-point fallback, heading is random.
- **Spawn protection**: 3 s of invulnerability, ended early if the player fires. Shown by a blinking hull.

## Sinking

- A frigate sinks when its HP reaches 0. A short sinking animation plays (≈ 2 s); the wreck does not block anything.
- **Respawn delay: 3 s** after sinking.
- Projectiles fired before sinking stay active and can still score.

## Scoring

- Capturing another player's home base costs its original owner **5 points** and awards the capturer **5 points**. Scores may be negative (Q101).
- **+1 point** to the player whose shell or torpedo dealt the final damage.
- Each active, owned non-home base awards its owner **+1 point** for each Base income interval it remains held; home bases never pay, and capture itself awards no points (Q115, Q175).
- Sinking yourself (own shell / torpedo, or running into land): no point gained, **−1 point**.
- No points for damage that does not sink.
- Scores are kept for as long as the player stays connected; a player leaving loses their score.
- The full (Tab) scoreboard also shows the number of times each player was sunk.
- There is no win condition: the game is infinite. The host may reset scores (see [07-multiplayer.md](07-multiplayer.md)).

## New maps and score resets

- When a new map is generated, all bases MUST be re-placed and each player MUST get their home base back (Q110).
- Resetting scores MUST NOT change bases.
- On a new map, every non-home base starts neutral, and each player gets their home base back (Q110, Q118).

## Rounds

The default round lasts 10 minutes. The host may choose 5–30 minutes in 5-minute steps or Endless. At the end of a timed round the simulation freezes for a 10-second intermission; projectiles are cleared and snapshots continue. The end screen lists all current players, including bots, ordered by score, sinks, then deaths. Every player with the top score wins; if every player is tied, the result is a Draw. Accuracy is hits divided by shots, or `—` when no shots were fired. After the intermission, a new map is generated with current settings, scores and round stats reset, base timers cleared, and all frigates respawned at home with full supplies (Q193–Q200).

Reset scores starts a fresh round immediately without an end screen. Regenerate changes the map but keeps scores and the current timer. Changing Round length restarts the timer; Endless has no timer. During intermission, settings apply to the next round, while Regenerate and Reset scores are rejected (Q199).
